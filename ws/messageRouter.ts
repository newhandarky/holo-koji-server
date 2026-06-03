import type { IncomingMessage } from 'http';
import { type RawData, type WebSocket, type WebSocketServer } from 'ws';
import {
    backendLogger,
    summarizeWebSocketMessage
} from '../utils/runtimeLogger.js';
import {
    createConnectionContext,
} from './connectionContext.js';
import { handleLeaveRoom } from './roomLifecycleHandlers.js';
import type { WebSocketRoomLike } from './roomHandlerTypes.js';
import {
    dispatchWebSocketMessage,
    type WebSocketMessageDispatchDependencies
} from './wsMessageDispatch.js';
import { parseWebSocketMessage } from './wsMessageParser.js';

export type WebSocketRouterDependencies<TRoom extends WebSocketRoomLike> =
    WebSocketMessageDispatchDependencies<TRoom>;

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
                const message = parseWebSocketMessage(data);
                backendLogger.diagnostic('🐞 [Server] 收到訊息摘要', {
                    origin: context.origin,
                    ...summarizeWebSocketMessage(message)
                });

                await dispatchWebSocketMessage(ws, message, context, deps);
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
