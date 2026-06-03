import type { WebSocketConnectionContext } from './connectionContext.js';
import {
    confirmRoomOrder,
    confirmRoomReady,
    handleRoomGameAction,
    requestRoomRematch
} from './gameMessageRuntime.js';
import type {
    MessageHandlerDependencies,
    RoomMessageHandlerLike
} from './roomHandlerTypes.js';

export const handleConfirmOrder = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    confirmRoomOrder(context, deps);
};

export const handleGameAction = <TRoom extends RoomMessageHandlerLike>(
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    handleRoomGameAction(payload, context, deps);
};

export const handleReadyConfirm = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    confirmRoomReady(context, deps);
};

export const handleRematchRequest = <TRoom extends RoomMessageHandlerLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    requestRoomRematch(context, deps);
};

export type {
    MessageHandlerDependencies,
    RoomMessageHandlerLike
} from './roomHandlerTypes.js';
