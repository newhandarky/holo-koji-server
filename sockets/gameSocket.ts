// server/src/sockets/gameSocket.ts
import { Server as SocketServer, Socket } from 'socket.io';
import { gameManager } from '../models/GameManager';
import {
    Player,
    GameAction,
    WebSocketMessage,
    WebSocketEventType,
    GameStartedPayload,
    PlayerJoinedPayload,
    OrderDecisionResultPayload
} from "game-shared-types"
import { backendLogger } from '../utils/runtimeLogger.js';

// 設定 Socket.IO 遊戲事件
export function setupGameSocket(io: SocketServer) {
    io.on('connection', (socket: Socket) => {
        backendLogger.diagnostic('🐞 [Socket.IO] 玩家連接摘要', { socketId: socket.id });

        // 1. 處理玩家加入遊戲
        socket.on('JOIN_GAME', (data: { gameId: string; playerData: Player }) => {
            const { gameId, playerData } = data;
            backendLogger.diagnostic('🐞 [Socket.IO] 加入房間摘要', {
                gameId,
                playerId: playerData.id
            });

            // 加入 Socket.IO 房間
            socket.join(gameId);

            // 檢查遊戲是否存在，不存在則建立
            let game = gameManager.getGame(gameId);
            if (!game) {
                game = gameManager.createGame(gameId);

                // 發送 ROOM_CREATED 事件
                socket.emit('ROOM_CREATED', {
                    type: 'ROOM_CREATED',
                    payload: { gameId, gameState: game }
                } as WebSocketMessage);
            }

            const updatedGame = gameManager.addPlayer(gameId, playerData);
            if (updatedGame) {
                // 通知新玩家遊戲已開始
                socket.emit('GAME_STARTED', {
                    type: 'GAME_STARTED',
                    payload: {
                        gameState: updatedGame,
                        message: `歡迎加入遊戲 ${gameId}`
                    } as GameStartedPayload
                } as WebSocketMessage<GameStartedPayload>);

                // 通知房間內其他玩家有新玩家加入
                socket.to(gameId).emit('PLAYER_JOINED', {
                    type: 'PLAYER_JOINED',
                    payload: {
                        player: playerData,
                        gameState: updatedGame
                    } as PlayerJoinedPayload
                } as WebSocketMessage<PlayerJoinedPayload>);
            }
        });

        // 2. 處理遊戲動作 (對應您原本可能的遊戲邏輯)
        socket.on('GAME_ACTION', (data: { gameId: string; action: GameAction }) => {
            const { gameId, action } = data;
            backendLogger.diagnostic('🐞 [Socket.IO] 遊戲動作摘要', {
                gameId,
                actionType: action.type
            });

            const updatedGame = gameManager.executeAction(gameId, action);

            if (updatedGame) {
                // 廣播遊戲狀態更新
                io.to(gameId).emit('GAME_STATE_UPDATE', {
                    type: 'STATE_CHANGED',
                    payload: updatedGame
                } as WebSocketMessage<GameState>);
            }
        });

        socket.on('START_ORDER_DECISION', (data: { gameId: string; players: string[] }) => {
            const { gameId, players } = data;

            const updatedGame = gameManager.executeAction(gameId, {
                type: 'START_ORDER_DECISION',
                payload: { players }
            });

            if (updatedGame) {
                io.to(gameId).emit('ORDER_DECISION_START', {
                    type: 'ORDER_DECISION_START',
                    payload: {
                        players,
                        gameState: updatedGame
                    }
                } as WebSocketMessage);
            }
        });

        // 順序決定結果
        socket.on('ORDER_DECISION_COMPLETE', (data: { gameId: string; result: any }) => {
            const { gameId, result } = data;

            const updatedGame = gameManager.executeAction(gameId, {
                type: 'ORDER_DECISION_RESULT',
                payload: result
            });

            if (updatedGame) {
                io.to(gameId).emit('ORDER_DECISION_RESULT', {
                    type: 'ORDER_DECISION_RESULT',
                    payload: {
                        ...result,
                        gameState: updatedGame
                    } as OrderDecisionResultPayload
                } as WebSocketMessage<OrderDecisionResultPayload>);
            }
        });

        // 4. 處理斷線
        socket.on('disconnect', (reason) => {
            backendLogger.diagnostic('🐞 [Socket.IO] 玩家斷線摘要', {
                socketId: socket.id,
                reason
            });
        });

        // 5. 處理錯誤
        socket.on('error', (error) => {
            backendLogger.error('❌ [Socket.IO] Socket 錯誤', {
                socketId: socket.id,
                error: error instanceof Error ? error.message : 'unknown'
            });
        });
    });

    // 處理 Socket.IO 伺服器級別的錯誤
    io.on('error', (error) => {
        backendLogger.error('❌ [Socket.IO] 伺服器錯誤', {
            error: error instanceof Error ? error.message : 'unknown'
        });
    });
}
