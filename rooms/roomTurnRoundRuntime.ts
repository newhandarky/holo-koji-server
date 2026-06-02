import type { ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    cloneGeishasForNextRound,
    type ServerGameState
} from '../utils/gameUtils.js';
import { accountStore } from '../utils/accountStore.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    determineWinner,
    getNextRoundOrder,
    resolveRoundBoard
} from '../game/roundResolution.js';
import {
    advanceToNextTurn,
    prepareCurrentTurn,
    revealSecretCards
} from '../game/turnLifecycle.js';
import {
    replaceScheduledTimer,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';
import type { RoomSeat } from '../utils/roomSession.js';
import type { WireMessage } from './roomMessaging.js';

type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

export type RoomTurnRoundRuntime = {
    roomId: string;
    gameState: ServerGameState | null;
    players: RoomSeat[];
    scheduler: RoomScheduler;
    roundResolveTimer: TimerHandle | null;
    lastRoundStarterId: string | null;
    baseGeishas: ServerGameState['geishas'] | null;
    dealSequence: unknown[];
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    broadcastGameState: () => void;
    beginTurnForCurrentPlayer: () => void;
    endTurn: () => void;
    resolveRound: () => void;
    startNextRound: () => void;
    scheduleNextRound: () => void;
    scheduleNpcTurn: () => void;
    isNpcPlayerId: (playerId: string) => boolean;
    buildDealSequenceForPlayer: (playerId: string) => unknown;
    prepareRoundState: (options?: RoundPreparationOptions) => void;
};

const createHiddenDrawCard = (playerId: string): ItemCard => ({
    id: `hidden-draw-${playerId}-0`,
    geishaId: 0,
    type: 'hidden'
});

export const beginRoomTurnForCurrentPlayer = (room: RoomTurnRoundRuntime): void => {
    if (!room.gameState) {
        return;
    }

    const result = prepareCurrentTurn(room.gameState);
    room.gameState = result.gameState;

    if (result.outcome.type === 'missing-player') {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 找不到當前玩家資料`, {
            roomId: room.roomId
        });
        return;
    }

    if (result.outcome.type === 'skip-player') {
        backendLogger.info(`🔄 玩家 ${result.outcome.playerId} 已無可用行動，跳到下一位`, {
            roomId: room.roomId,
            playerId: result.outcome.playerId
        });
        room.endTurn();
        return;
    }

    const currentPlayerId = result.outcome.playerId;

    if (result.outcome.type === 'drawn-card') {
        const drawnCard = result.outcome.card;
        room.players.forEach((player) => {
            const visibleCard = player.playerId === currentPlayerId
                ? drawnCard
                : createHiddenDrawCard(currentPlayerId);

            room.sendToPlayer(player.playerId, {
                type: 'CARD_DRAWN',
                payload: {
                    playerId: currentPlayerId,
                    card: visibleCard
                }
            });
        });
    }

    room.broadcastGameState();

    if (room.isNpcPlayerId(currentPlayerId)) {
        room.scheduleNpcTurn();
    }
};

export const endRoomTurn = (room: RoomTurnRoundRuntime): void => {
    if (!room.gameState) {
        return;
    }

    const result = advanceToNextTurn(room.gameState);
    room.gameState = result.gameState;

    if (result.outcome.type === 'resolve-round') {
        backendLogger.info(`🧮 房間 ${room.roomId} 所有玩家行動結束，進入結算階段`, {
            roomId: room.roomId
        });
        room.resolveRound();
        return;
    }

    room.beginTurnForCurrentPlayer();
};

export const resolveRoomRound = (room: RoomTurnRoundRuntime): void => {
    if (!room.gameState) {
        return;
    }

    room.gameState.phase = 'resolution';

    room.broadcast({
        type: 'ROUND_COMPLETE',
        payload: { round: room.gameState.round }
    });

    room.gameState.players = revealSecretCards(room.gameState.players);

    const gameState = room.gameState;
    const firstPlayer = gameState.players[0];
    const secondPlayer = gameState.players[1];
    if (!firstPlayer || !secondPlayer) {
        return;
    }

    const resolution = resolveRoundBoard(gameState.geishas, gameState.players);
    gameState.geishas = resolution.geishas;
    gameState.players.forEach((player) => {
        const score = resolution.scores.get(player.id);
        if (score) {
            player.score.charm = score.charm;
            player.score.tokens = score.tokens;
        }
    });

    room.broadcastGameState();

    const winner = determineWinner(room.gameState.players);
    if (winner) {
        room.gameState.phase = 'ended';
        room.gameState.winner = winner;
        if (room.gameState.removedCard) {
            room.gameState.settlement = {
                ...(room.gameState.settlement ?? {}),
                removedCard: room.gameState.removedCard
            };
        }
        if (!room.currentCompletionId) {
            room.matchCompletionCounter += 1;
            room.currentCompletionId = `${room.roomId}:match-${room.matchCompletionCounter}:ended`;
        }
        void accountStore.recordMatchCompletion({
            completionId: room.currentCompletionId,
            winner,
            players: room.players.map((player) => ({
                playerId: player.playerId,
                accountProfile: player.accountProfile
            }))
        }).catch((error) => {
            backendLogger.error('❌ Account counter update failed', {
                roomId: room.roomId,
                error: error instanceof Error ? error.message : 'unknown'
            });
        });

        room.broadcast({
            type: 'GAME_ENDED',
            payload: { winner }
        });

        room.broadcastGameState();
        return;
    }

    room.scheduleNextRound();
};

export const scheduleRoomNextRound = (
    room: Pick<RoomTurnRoundRuntime, 'roundResolveTimer' | 'scheduler' | 'startNextRound'>
): void => {
    room.roundResolveTimer = replaceScheduledTimer(room.scheduler, room.roundResolveTimer, () => {
        room.roundResolveTimer = null;
        room.startNextRound();
    }, 2500);
};

export const startRoomNextRound = (room: RoomTurnRoundRuntime): void => {
    if (!room.gameState) {
        return;
    }

    const nextOrder = getNextRoundOrder(room.gameState.players, room.lastRoundStarterId);
    if (nextOrder.length < 2) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 無法開始下一輪（玩家不足）`, {
            roomId: room.roomId,
            playerCount: nextOrder.length
        });
        return;
    }

    room.baseGeishas = cloneGeishasForNextRound(room.gameState.geishas);
    room.lastRoundStarterId = nextOrder[0] ?? null;

    room.prepareRoundState({
        orderedPlayerIds: nextOrder,
        roundNumber: room.gameState.round + 1,
        openOrderDecision: false
    });

    if (room.dealSequence.length > 0) {
        room.players.forEach((player) => {
            room.sendToPlayer(player.playerId, {
                type: 'DEAL_ANIMATION',
                payload: {
                    sequence: room.buildDealSequenceForPlayer(player.playerId)
                }
            });
        });
    }

    room.broadcastGameState();
    room.beginTurnForCurrentPlayer();
};
