import type { ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    advanceToNextTurn,
    prepareCurrentTurn
} from '../game/turnLifecycle.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { RoomTurnRoundRuntime } from './roomTurnRoundRuntime.js';

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
