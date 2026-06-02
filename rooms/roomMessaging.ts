import type {
    GeishaSet,
    ItemCard,
    PendingInteraction
} from '@newhandarky/hanakoji-game-types';
import {
    buildPlayerVisibleGameState,
    sanitizePendingInteractionForViewer
} from '../game/playerVisibleState.js';
import {
    type ServerGameState
} from '../utils/gameUtils.js';
import {
    backendLogger,
    summarizeWebSocketMessage
} from '../utils/runtimeLogger.js';
import type { RoomSeat } from '../utils/roomSession.js';
import type { DealSequenceStep } from '../game/roundPreparation.js';

export type WireMessage = {
    type: string;
    payload?: unknown;
};

export const createMaskedCard = (prefix: string, index: number): ItemCard => ({
    id: `hidden-${prefix}-${index}`,
    geishaId: 0,
    type: 'hidden'
});

export const sendRoomMessage = (
    roomId: string,
    seats: readonly RoomSeat[],
    playerId: string,
    message: WireMessage
): void => {
    const target = seats.find(player => player.playerId === playerId);
    if (!target) {
        backendLogger.warn(`⚠️ 找不到玩家 ${playerId}，無法傳送訊息`, {
            roomId,
            playerId
        });
        return;
    }

    if (target.ws.readyState !== 1) {
        backendLogger.warn(`⚠️ 玩家 ${playerId} 連線狀態異常`, {
            roomId,
            playerId,
            readyState: target.ws.readyState
        });
        return;
    }

    try {
        target.ws.send(JSON.stringify(message));
        backendLogger.diagnostic('🐞 [Server] 傳送訊息摘要', {
            roomId,
            targetPlayerId: playerId,
            ...summarizeWebSocketMessage(message)
        });
    } catch (error) {
        backendLogger.error(`❌ 傳送訊息給玩家 ${playerId} 失敗`, {
            roomId,
            playerId,
            type: typeof message?.type === 'string' ? message.type : 'unknown',
            error: error instanceof Error ? error.message : 'unknown'
        });
    }
};

export const broadcastRoomMessage = (
    roomId: string,
    seats: readonly RoomSeat[],
    message: WireMessage,
    excludePlayerId: string | null = null
): void => {
    let successCount = 0;
    seats.forEach((player) => {
        if (player.playerId === excludePlayerId) {
            return;
        }

        if (player.ws.readyState !== 1) {
            backendLogger.warn(`⚠️ 房間 ${roomId} 廣播時玩家連線狀態異常`, {
                roomId,
                playerId: player.playerId,
                readyState: player.ws.readyState
            });
            return;
        }

        try {
            player.ws.send(JSON.stringify(message));
            successCount += 1;
        } catch (error) {
            backendLogger.error(`❌ 房間 ${roomId} 廣播失敗`, {
                roomId,
                playerId: player.playerId,
                type: typeof message?.type === 'string' ? message.type : 'unknown',
                error: error instanceof Error ? error.message : 'unknown'
            });
        }
    });

    backendLogger.diagnostic('🐞 [Server] 廣播訊息摘要', {
        roomId,
        successCount,
        playerCount: seats.length,
        excludedPlayerId: excludePlayerId ?? undefined,
        ...summarizeWebSocketMessage(message)
    });
};

export const buildPendingInteractionMessages = (
    seats: readonly RoomSeat[],
    pendingInteraction: PendingInteraction
): Array<{ playerId: string; message: WireMessage }> => (
    seats.map(player => ({
        playerId: player.playerId,
        message: {
            type: 'PENDING_INTERACTION',
            payload: sanitizePendingInteractionForViewer(pendingInteraction, player.playerId)
        }
    }))
);

export const buildViewerGameState = (
    gameState: ServerGameState | null | undefined,
    viewerId: string,
    geishaSet: GeishaSet
): ServerGameState | null => buildPlayerVisibleGameState(gameState, viewerId, { geishaSet });

export const buildMaskedDealSequence = (
    dealSequence: readonly DealSequenceStep[],
    playerId: string
): DealSequenceStep[] => (
    dealSequence.map((step, index) => ({
        ...step,
        card: createMaskedCard(`${playerId}-deal`, index)
    }))
);
