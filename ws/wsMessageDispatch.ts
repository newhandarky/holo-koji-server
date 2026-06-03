import type { WebSocket } from 'ws';
import type { AccountSyncRequest } from '@newhandarky/hanakoji-game-types';
import type { AccountStore } from '../utils/accountStore.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { RestorableRoomSnapshot } from '../rooms/roomRestore.js';
import {
    handleAccountStatus,
    handleAccountSync,
    handleAchievementAckNewUnlocks,
    handleAchievementStatus
} from './accountHandlers.js';
import type { WebSocketConnectionContext } from './connectionContext.js';
import {
    handleConfirmOrder,
    handleGameAction,
    handleReadyConfirm,
    handleRematchRequest
} from './messageHandlers.js';
import {
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom
} from './roomLifecycleHandlers.js';
import type { WebSocketRoomLike } from './roomHandlerTypes.js';
import {
    getMessagePayload,
    type ParsedWebSocketMessage
} from './wsMessageParser.js';

export interface WebSocketMessageDispatchDependencies<TRoom extends WebSocketRoomLike> {
    rooms: Map<string, TRoom>;
    createRoom: (roomId: string) => TRoom;
    loadRoomSnapshot: <TSnapshot = RestorableRoomSnapshot>(roomId: string) => Promise<TSnapshot | null>;
    deleteRoomSnapshot: (roomId: string) => Promise<void>;
    accountStore: AccountStore;
    resolveVerifiedLineAccountRequest: (payload?: AccountSyncRequest) => Promise<AccountSyncRequest | null>;
}

export const dispatchWebSocketMessage = async <TRoom extends WebSocketRoomLike>(
    ws: WebSocket,
    message: ParsedWebSocketMessage,
    context: WebSocketConnectionContext,
    deps: WebSocketMessageDispatchDependencies<TRoom>
): Promise<void> => {
    switch (message.type) {
        case 'ACCOUNT_SYNC':
            await handleAccountSync(ws, getMessagePayload(message), context, deps);
            break;
        case 'ACCOUNT_STATUS':
            await handleAccountStatus(ws, context, deps);
            break;
        case 'ACHIEVEMENT_STATUS':
            await handleAchievementStatus(ws, context, deps);
            break;
        case 'ACHIEVEMENT_ACK_NEW_UNLOCKS':
            await handleAchievementAckNewUnlocks(ws, getMessagePayload(message), context, deps);
            break;
        case 'JOIN_ROOM':
            await handleJoinRoom(ws, getMessagePayload(message), context, deps);
            break;
        case 'CREATE_ROOM':
            await handleCreateRoom(ws, getMessagePayload(message), context, deps);
            break;
        case 'CONFIRM_ORDER':
            handleConfirmOrder(context, deps);
            break;
        case 'GAME_ACTION':
            handleGameAction(getMessagePayload(message), context, deps);
            break;
        case 'READY_CONFIRM':
            handleReadyConfirm(context, deps);
            break;
        case 'REMATCH_REQUEST':
            handleRematchRequest(context, deps);
            break;
        case 'LEAVE_ROOM':
            handleLeaveRoom(ws, context, deps);
            break;
        default:
            backendLogger.warn('⚠️ 未知訊息類型', {
                type: typeof message?.type === 'string' ? message.type : 'unknown',
                origin: context.origin
            });
    }
};
