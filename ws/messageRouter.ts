import type { IncomingMessage } from 'http';
import { type RawData, type WebSocket, type WebSocketServer } from 'ws';
import type { AccountSyncRequest, ClientToServerMessage } from '@newhandarky/hanakoji-game-types';
import type { AccountStore } from '../utils/accountStore.js';
import {
    backendLogger,
    summarizeWebSocketMessage
} from '../utils/runtimeLogger.js';
import type { RestorableRoomSnapshot } from '../rooms/roomRestore.js';
import {
    createConnectionContext,
    type WebSocketConnectionContext
} from './connectionContext.js';
import {
    handleAccountStatus,
    handleAccountSync,
    handleAchievementAckNewUnlocks,
    handleAchievementStatus
} from './accountHandlers.js';
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

export interface WebSocketRouterDependencies<TRoom extends WebSocketRoomLike> {
    rooms: Map<string, TRoom>;
    createRoom: (roomId: string) => TRoom;
    loadRoomSnapshot: <TSnapshot = RestorableRoomSnapshot>(roomId: string) => Promise<TSnapshot | null>;
    deleteRoomSnapshot: (roomId: string) => Promise<void>;
    accountStore: AccountStore;
    resolveVerifiedLineAccountRequest: (payload?: AccountSyncRequest) => Promise<AccountSyncRequest | null>;
}

const getMessagePayload = (message: Partial<ClientToServerMessage> & { payload?: unknown }): unknown => (
    message.payload
);

const parseMessage = (data: RawData): Partial<ClientToServerMessage> & { type?: unknown; payload?: unknown } => (
    JSON.parse(data.toString()) as Partial<ClientToServerMessage> & { type?: unknown; payload?: unknown }
);

const handleMessage = async <TRoom extends WebSocketRoomLike>(
    ws: WebSocket,
    message: Partial<ClientToServerMessage> & { type?: unknown; payload?: unknown },
    context: WebSocketConnectionContext,
    deps: WebSocketRouterDependencies<TRoom>
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

export const registerWebSocketHandlers = <TRoom extends WebSocketRoomLike>(
    wss: WebSocketServer,
    deps: WebSocketRouterDependencies<TRoom>
): void => {
    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const context = createConnectionContext(req.headers.origin);
        backendLogger.info('🔌 客戶端已連接', {
            origin: context.origin
        });

        ws.on('message', async (data: RawData) => {
            try {
                const message = parseMessage(data);
                backendLogger.diagnostic('🐞 [Server] 收到訊息摘要', {
                    origin: context.origin,
                    ...summarizeWebSocketMessage(message)
                });

                await handleMessage(ws, message, context, deps);
            } catch (error) {
                backendLogger.error('❌ 訊息解析錯誤', {
                    origin: context.origin,
                    error: error instanceof Error ? error.message : 'unknown'
                });
            }
        });

        ws.on('close', () => {
            if (context.currentRoomId && context.currentPlayerId) {
                handleLeaveRoom(ws, context, deps);
            }
            backendLogger.info('🔌 客戶端已斷線', {
                origin: context.origin,
                roomId: context.currentRoomId ?? undefined,
                playerId: context.currentPlayerId ?? undefined
            });
        });
    });
};
