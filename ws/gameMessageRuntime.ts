import { backendLogger } from '../utils/runtimeLogger.js';
import type { WebSocketConnectionContext } from './connectionContext.js';
import { parseGameActionPayload } from './gameMessagePayloads.js';
import type {
    MessageHandlerDependencies,
    RoomMessageHandlerLike
} from './roomHandlerTypes.js';

const findAttachedRoom = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): { room: TRoom; roomId: string; playerId: string } | null => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return null;
    }
    const room = deps.rooms.get(context.currentRoomId);
    return room
        ? { room, roomId: context.currentRoomId, playerId: context.currentPlayerId }
        : null;
};

export const confirmRoomOrder = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    const attached = findAttachedRoom(context, deps);
    attached?.room.confirmOrder(attached.playerId);
};

export const handleRoomGameAction = <TRoom extends RoomMessageHandlerLike>(
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    const attached = findAttachedRoom(context, deps);
    if (!attached) {
        return;
    }

    const parsed = parseGameActionPayload(payload);
    if (!parsed.ok) {
        backendLogger.warn('⚠️ GAME_ACTION 缺少 action 內容', {
            roomId: attached.roomId,
            playerId: attached.playerId
        });
        attached.room.sendError(attached.playerId, '缺少行動內容');
        return;
    }

    attached.room.handleAction(attached.playerId, parsed.action);
};

export const confirmRoomReady = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    const attached = findAttachedRoom(context, deps);
    attached?.room.confirmReady(attached.playerId);
};

export const requestRoomRematch = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    const attached = findAttachedRoom(context, deps);
    attached?.room.requestRematch(attached.playerId);
};
