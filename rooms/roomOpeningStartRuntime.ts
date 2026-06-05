import {
    canStartGameWithOrder,
    createOrderDecisionState
} from '../game/openingFlow.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { RoomOpeningRuntime } from './roomOpeningRuntime.js';

export const startRoomGameWithOrder = (room: RoomOpeningRuntime): void => {
    const playerIds = room.players.map(player => player.playerId);
    const orderDecisionResult = room.orderDecisionState.result;
    if (!orderDecisionResult || !canStartGameWithOrder(
        playerIds,
        orderDecisionResult,
        room.orderDecisionState.confirmations,
        room.readyConfirmations
    )) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 開局條件尚未完成，拒絕提前發牌`, {
            roomId: room.roomId,
            hasOrderResult: Boolean(room.orderDecisionState.result),
            confirmedOrder: Array.from(room.orderDecisionState.confirmations),
            confirmedReady: Array.from(room.readyConfirmations)
        });
        return;
    }

    const { order } = orderDecisionResult;
    if (!room.ensureBaseGeishas()) {
        return;
    }
    room.prepareRoundState({
        orderedPlayerIds: order,
        roundNumber: room.gameState?.round ?? 1,
        openOrderDecision: false
    });
    room.lastRoundStarterId = order[0] ?? null;

    backendLogger.info(`🚀 遊戲開始`, {
        roomId: room.roomId,
        geishaSet: room.geishaSet,
        firstPlayer: order[0],
        secondPlayer: order[1]
    });

    room.broadcastGameStateEvent('GAME_STARTED');

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

    room.beginTurnForCurrentPlayer();

    room.orderDecisionState = createOrderDecisionState();
    room.readyConfirmations.clear();
};
