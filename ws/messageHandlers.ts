import { backendLogger } from '../utils/runtimeLogger.js';
import type { GameActionPayload } from '../game/actionValidation.js';
import type { WebSocketConnectionContext } from './connectionContext.js';
import type {
    MessageHandlerDependencies,
    WebSocketRoomLike
} from './roomHandlerTypes.js';

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const handleConfirmOrder = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    deps.rooms.get(context.currentRoomId)?.confirmOrder(context.currentPlayerId);
};

export const handleGameAction = <TRoom extends WebSocketRoomLike>(
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    const room = deps.rooms.get(context.currentRoomId);
    if (!room) {
        return;
    }
    if (!isRecord(payload) || !isRecord(payload.action) || typeof payload.action.type !== 'string') {
        backendLogger.warn('⚠️ GAME_ACTION 缺少 action 內容', {
            roomId: context.currentRoomId ?? undefined,
            playerId: context.currentPlayerId ?? undefined
        });
        room.sendError(context.currentPlayerId, '缺少行動內容');
        return;
    }
    const actionPayload = isRecord(payload.action.payload)
        ? payload.action.payload as GameActionPayload
        : undefined;
    room.handleAction(context.currentPlayerId, {
        type: payload.action.type,
        ...(actionPayload ? { payload: actionPayload } : {})
    });
};

export const handleReadyConfirm = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    deps.rooms.get(context.currentRoomId)?.confirmReady(context.currentPlayerId);
};

export const handleRematchRequest = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    deps.rooms.get(context.currentRoomId)?.requestRematch(context.currentPlayerId);
};

export type {
    MessageHandlerDependencies,
    WebSocketRoomLike
} from './roomHandlerTypes.js';
