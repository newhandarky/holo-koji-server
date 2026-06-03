import type { WebSocket } from 'ws';
import type { WebSocketConnectionContext } from './connectionContext.js';
import type {
    RoomLifecycleHandlerDependencies,
    RoomLifecycleHandlerLike
} from './roomHandlerTypes.js';
import {
    createRoomFromLifecyclePayload,
    joinRoomFromLifecyclePayload
} from './roomCreateJoinRuntime.js';
import { leaveRoomFromLifecycleContext } from './roomLeaveRuntime.js';
import {
    parseCreateRoomPayload,
    parseJoinRoomPayload
} from './roomLifecyclePayloads.js';
import {
    rejectAttachedConnection,
    sendLifecycleError
} from './roomLifecycleResponses.js';

export const handleCreateRoom = async <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>
): Promise<void> => {
    if (rejectAttachedConnection(ws, context)) {
        return;
    }
    const parsedPayload = parseCreateRoomPayload(payload);
    if (!parsedPayload.ok) {
        sendLifecycleError(ws, parsedPayload.error.message, parsedPayload.error.code);
        return;
    }
    await createRoomFromLifecyclePayload(ws, context, deps, parsedPayload.value);
};

export const handleJoinRoom = async <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>
): Promise<void> => {
    if (rejectAttachedConnection(ws, context)) {
        return;
    }
    const parsedPayload = parseJoinRoomPayload(payload);
    if (!parsedPayload.ok) {
        sendLifecycleError(ws, parsedPayload.error.message, parsedPayload.error.code);
        return;
    }
    await joinRoomFromLifecyclePayload(ws, context, deps, parsedPayload.value);
};

export const handleLeaveRoom = <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>
): void => {
    leaveRoomFromLifecycleContext(ws, context, deps);
};
