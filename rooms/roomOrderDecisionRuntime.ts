import {
    applyOrderConfirmation,
    applyOrderDecisionResult,
    buildConfirmationUpdate,
    buildOrderDecisionGameState,
    choosePlayerOrder
} from '../game/openingFlow.js';
import { getNpcThinkingDelay } from '../npc/npcConfig.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { RoomOpeningRuntime } from './roomOpeningRuntime.js';

export const prepareRoomOrderDecisionState = (room: RoomOpeningRuntime): boolean => {
    const playerIds = room.players.map(p => p.playerId);

    if (playerIds.length < 2) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 嘗試準備順序決定，但玩家不足`, {
            roomId: room.roomId,
            playerCount: playerIds.length
        });
        return false;
    }

    if (!room.ensureBaseGeishas()) {
        return false;
    }
    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        return false;
    }

    const preparation = buildOrderDecisionGameState({
        roomId: room.roomId,
        hostId: room.hostId,
        playerIds,
        baseGeishas,
        geishaSet: room.geishaSet,
        playerMetaMap: room.getPlayerMetaMap()
    });
    if (!preparation.ok) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 無法準備順序決定`, {
            roomId: room.roomId,
            error: preparation.errorMessage
        });
        return false;
    }

    room.gameState = preparation.value;
    room.dealSequence = [];
    return true;
};

export const startRoomOrderDecision = (room: RoomOpeningRuntime): void => {
    backendLogger.info(`🎲 房間 ${room.roomId} 開始隨機決定玩家順序`, {
        roomId: room.roomId
    });

    if (!prepareRoomOrderDecisionState(room)) {
        return;
    }
    room.orderDecisionState.isDeciding = true;
    room.orderDecisionState.confirmations.clear();

    room.broadcast({
        type: 'ORDER_DECISION_START',
        payload: {
            players: room.players.map(p => p.playerId)
        }
    });

    if (room.gameState) {
        room.broadcastGameState();
    }

    room.scheduler.setTimeout(() => {
        decideRoomOrder(room);
    }, 2000);
};

export const decideRoomOrder = (room: RoomOpeningRuntime): void => {
    const playerIds = room.players.map(p => p.playerId);

    const result = choosePlayerOrder(playerIds);
    if (!result) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 無法決定順序`, {
            roomId: room.roomId,
            playerCount: playerIds.length
        });
        return;
    }
    const { firstPlayer, secondPlayer } = result;
    room.orderDecisionState.result = result;

    backendLogger.info(`🎲 房間 ${room.roomId} 順序決定完成`, {
        roomId: room.roomId,
        firstPlayer: firstPlayer,
        secondPlayer: secondPlayer
    });

    const gameState = room.gameState;
    if (gameState) {
        room.gameState = applyOrderDecisionResult(gameState, result);
    }

    room.broadcast({
        type: 'ORDER_DECISION_RESULT',
        payload: room.orderDecisionState.result
    });

    if (room.gameState) {
        room.broadcastGameState();
    }

    if (room.npcId) {
        const delay = getNpcThinkingDelay(room.npcDifficulty);
        room.scheduler.setTimeout(() => {
            if (room.npcId) {
                room.confirmOrder(room.npcId);
            }
        }, delay);
    }
};

export const confirmRoomOrder = (
    room: RoomOpeningRuntime,
    playerId: string
): void => {
    if (!room.validatePlayerInRoom(playerId)) {
        return;
    }

    if (!room.orderDecisionState.result) {
        backendLogger.warn(`⚠️ 玩家 ${playerId} 嘗試確認，但順序尚未決定`, {
            roomId: room.roomId,
            playerId
        });
        room.sendError(playerId, '順序尚未決定，請稍後再確認');
        return;
    }

    const update = buildConfirmationUpdate(
        room.players.map(player => player.playerId),
        room.orderDecisionState.confirmations,
        playerId
    );
    if (!update.added) {
        backendLogger.info(`ℹ️ 玩家 ${playerId} 重複確認順序，忽略重送`, {
            roomId: room.roomId,
            playerId
        });
        return;
    }

    room.orderDecisionState.confirmations = new Set(update.confirmations);
    backendLogger.info(`✅ 玩家 ${playerId} 已確認順序`, {
        roomId: room.roomId,
        playerId,
        confirmations: room.orderDecisionState.confirmations.size
    });

    if (room.gameState) {
        room.gameState = applyOrderConfirmation(room.gameState, update);
    }

    room.broadcast({
        type: 'ORDER_CONFIRMATION_UPDATE',
        payload: {
            confirmations: update.confirmations,
            waitingFor: update.waitingFor
        }
    });

    if (room.gameState) {
        room.broadcastGameState();
    }

    if (update.confirmations.length === 2) {
        room.scheduler.setTimeout(() => {
            room.startReadyCheck();
        }, 800);
    }
};
