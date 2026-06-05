import { cloneGeishasForNextRound } from '../game/geishaBoardFactory.js';
import {
    determineWinner,
    getNextRoundOrder,
    resolveRoundBoard
} from '../game/roundResolution.js';
import { revealSecretCards } from '../game/turnLifecycle.js';
import { accountStore } from '../utils/accountStore.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    replaceScheduledTimer,
    type TimerHandle
} from './roomScheduler.js';
import type { RoomTurnRoundRuntime } from './roomTurnRoundRuntime.js';

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
