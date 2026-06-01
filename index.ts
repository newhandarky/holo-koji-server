// server/index.ts - authoritative game server entrypoint
import './utils/localEnv.js';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createHttpApp } from './http/app.js';
import { GameRoom } from './rooms/gameRoom.js';
import { createRoomRegistry } from './rooms/roomRegistry.js';
import { accountStore } from './utils/accountStore.js';
import { resolveVerifiedLineAccountRequest } from './utils/lineIdentity.js';
import { deleteRoomSnapshot, loadRoomSnapshot } from './utils/roomStore.js';
import { backendLogger } from './utils/runtimeLogger.js';
import { registerWebSocketHandlers } from './ws/messageRouter.js';

const app = createHttpApp();
const server = createServer(app);
const gameRooms = createRoomRegistry<GameRoom>();
const wss = new WebSocketServer({ server });

registerWebSocketHandlers(wss, {
    rooms: gameRooms,
    createRoom: (roomId) => new GameRoom(roomId),
    loadRoomSnapshot,
    deleteRoomSnapshot,
    accountStore,
    resolveVerifiedLineAccountRequest
});

const PORT = Number(process.env.PORT || 3001);

server.listen(PORT, '0.0.0.0', () => {
    backendLogger.info('🚀 WebSocket 伺服器已啟動', {
        port: Number(PORT),
        environment: process.env.NODE_ENV ?? 'development'
    });
});
