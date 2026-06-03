import type { WebSocket } from 'ws';
import type { WebSocketConnectionContext } from './connectionContext.js';

export const sendLifecycleMessage = (
    ws: WebSocket,
    message: { type: string; payload?: unknown }
): void => {
    ws.send(JSON.stringify(message));
};

export const sendLifecycleError = (
    ws: WebSocket,
    message: string,
    code?: string
): void => {
    sendLifecycleMessage(ws, {
        type: 'ERROR',
        payload: {
            message,
            ...(code ? { code } : {})
        }
    });
};

export const rejectAttachedConnection = (
    ws: WebSocket,
    context: WebSocketConnectionContext
): boolean => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return false;
    }

    sendLifecycleError(ws, '目前已在房間內', 'ALREADY_IN_ROOM');
    return true;
};

export const sendRoomCreated = (
    ws: WebSocket,
    roomId: string,
    playerId: string,
    roomSessionToken?: string
): void => {
    sendLifecycleMessage(ws, {
        type: 'ROOM_CREATED',
        payload: { roomId, playerId, roomSessionToken }
    });
};

export const sendPlayerJoined = (
    ws: WebSocket,
    roomId: string,
    playerId: string,
    roomSessionToken?: string
): void => {
    sendLifecycleMessage(ws, {
        type: 'PLAYER_JOINED',
        payload: { playerId, roomId, roomSessionToken }
    });
};

export const sendGameStateUpdated = (
    ws: WebSocket,
    gameState: unknown
): void => {
    sendLifecycleMessage(ws, {
        type: 'GAME_STATE_UPDATED',
        payload: gameState
    });
};
