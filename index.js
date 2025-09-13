// server/index.js - 修正 CORS 設定
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
const server = createServer(app);

// CORS 設定 - 修正 GitHub Pages 完整路徑
app.use(cors({
    origin: [
        'http://localhost:3000',                              // 本地開發
        'https://holo-koji-frontend.onrender.com',           // Render.com 前端
        'https://newhandarky.github.io',                     // GitHub Pages 根域名
        'https://newhandarky.github.io/holo-koji',           // GitHub Pages 完整路徑（重要！）
        'https://newhandarky.github.io/holo-koji/'           // GitHub Pages 完整路徑含斜槓
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 健康檢查端點
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        corsOrigins: [
            'http://localhost:3000',
            'https://holo-koji-frontend.onrender.com',
            'https://newhandarky.github.io',
            'https://newhandarky.github.io/holo-koji',
            'https://newhandarky.github.io/holo-koji/'
        ]
    });
});

// WebSocket 設定
const gameRooms = new Map();
const wss = new WebSocketServer({ server });

class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = [];
        this.gameState = null;
        this.maxPlayers = 2;
    }

    addPlayer(playerId, ws) {
        if (this.players.length < this.maxPlayers) {
            this.players.push({ playerId, ws });
            console.log(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}，當前玩家數：${this.players.length}`);
            return true;
        }
        return false;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.playerId !== playerId);
        console.log(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}，當前玩家數：${this.players.length}`);
    }

    // 修正：確保所有活躍連線都收到廣播
    broadcast(message, excludePlayerId = null) {
        console.log(`📢 房間 ${this.roomId} 廣播訊息給 ${this.players.length} 個玩家:`, message.type);

        let successCount = 0;
        this.players.forEach((player, index) => {
            if (player.playerId !== excludePlayerId) {
                if (player.ws.readyState === 1) { // WebSocket.OPEN
                    try {
                        player.ws.send(JSON.stringify(message));
                        console.log(`  ✅ 成功發送給玩家 ${player.playerId} (${index + 1}/${this.players.length})`);
                        successCount++;
                    } catch (error) {
                        console.error(`  ❌ 發送失敗給玩家 ${player.playerId}:`, error);
                    }
                } else {
                    console.warn(`  ⚠️ 玩家 ${player.playerId} 連線狀態異常: ${player.ws.readyState}`);
                }
            }
        });

        console.log(`📢 廣播完成，成功發送給 ${successCount} 個玩家`);
    }

    isFull() {
        return this.players.length === this.maxPlayers;
    }
}

wss.on('connection', (ws, req) => {
    // 記錄連接來源
    const origin = req.headers.origin;
    console.log('🔌 客戶端已連接，來源:', origin);

    let currentPlayerId = null;
    let currentRoomId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 收到訊息:', message, '來源:', origin);

            switch (message.type) {
                case 'JOIN_ROOM':
                    handleJoinRoom(ws, message.payload);
                    break;
                case 'CREATE_ROOM':
                    handleCreateRoom(ws, message.payload);
                    break;
                case 'GAME_ACTION':
                    handleGameAction(ws, message.payload);
                    break;
                case 'LEAVE_ROOM':
                    handleLeaveRoom(ws);
                    break;
                default:
                    console.warn('⚠️ 未知訊息類型:', message.type);
            }
        } catch (error) {
            console.error('❌ 訊息解析錯誤:', error);
        }
    });

    ws.on('close', () => {
        if (currentRoomId && currentPlayerId) {
            handleLeaveRoom(ws);
        }
        console.log('🔌 客戶端已斷線，來源:', origin);
    });

    function handleCreateRoom(ws, payload) {
        const roomId = generateRoomId();
        const room = new GameRoom(roomId);
        gameRooms.set(roomId, room);

        currentPlayerId = payload.playerId;
        currentRoomId = roomId;

        room.addPlayer(currentPlayerId, ws);

        console.log(`🏠 房間 ${roomId} 已建立，創建者：${currentPlayerId}，來源：${origin}`);

        // 發送房間建立成功回應
        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { roomId, playerId: currentPlayerId }
        }));

        // 初始化等待中的遊戲狀態
        const initialGameState = createWaitingGameState(roomId, [currentPlayerId]);
        room.gameState = initialGameState;

        // 立即廣播初始狀態給房間內所有玩家
        room.broadcast({
            type: 'GAME_STATE_UPDATED',
            payload: initialGameState
        });
    }

    function handleJoinRoom(ws, payload) {
        const { roomId, playerId } = payload;
        const room = gameRooms.get(roomId);

        if (!room) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '房間不存在' }
            }));
            return;
        }

        if (room.isFull()) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '房間已滿' }
            }));
            return;
        }

        currentPlayerId = playerId;
        currentRoomId = roomId;

        room.addPlayer(playerId, ws);

        console.log(`👤 玩家 ${playerId} 加入房間 ${roomId}，來源：${origin}`);

        // 通知加入者
        ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            payload: { playerId, roomId }
        }));

        // 更新遊戲狀態包含兩位玩家
        const updatedGameState = createWaitingGameState(roomId, room.players.map(p => p.playerId));
        room.gameState = updatedGameState;

        // 廣播更新的狀態給所有玩家
        room.broadcast({
            type: 'GAME_STATE_UPDATED',
            payload: updatedGameState
        });

        // 如果房間滿了，延遲開始遊戲確保狀態更新
        if (room.isFull()) {
            console.log(`🎮 房間 ${roomId} 已滿，準備開始遊戲`);

            // 延遲 500ms 開始遊戲，確保所有玩家都收到狀態更新
            setTimeout(() => {
                startGame(room);
            }, 500);
        }
    }

    function handleGameAction(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (room) {
            room.broadcast({
                type: 'GAME_ACTION',
                payload: { ...payload, playerId: currentPlayerId }
            }, currentPlayerId);
        }
    }

    function handleLeaveRoom(ws) {
        if (currentRoomId && currentPlayerId) {
            const room = gameRooms.get(currentRoomId);
            if (room) {
                room.removePlayer(currentPlayerId);
                room.broadcast({
                    type: 'PLAYER_LEFT',
                    payload: { playerId: currentPlayerId }
                });

                if (room.players.length === 0) {
                    gameRooms.delete(currentRoomId);
                    console.log(`🗑️ 房間 ${currentRoomId} 已刪除`);
                }
            }
        }
    }
});

function startGame(room) {
    const playerIds = room.players.map(p => p.playerId);
    const gameState = createGameState(room.roomId, playerIds);
    room.gameState = gameState;

    console.log(`🚀 遊戲開始，房間 ${room.roomId}，玩家：`, playerIds);

    // 廣播遊戲開始給所有玩家
    room.broadcast({
        type: 'GAME_STARTED',
        payload: gameState
    });

    console.log(`📢 GAME_STARTED 已廣播給 ${room.players.length} 個玩家`);
}

function createWaitingGameState(gameId, playerIds) {
    return {
        gameId,
        players: playerIds.map(id => createPlayer(id)),
        geishas: createInitialGeishas(),
        currentPlayer: 0,
        phase: 'waiting',
        round: 1,
        winner: null
    };
}

function createGameState(gameId, playerIds) {
    const players = playerIds.map(id => createPlayerWithCards(id));

    return {
        gameId,
        players,
        geishas: createInitialGeishas(),
        currentPlayer: 0,
        phase: 'playing',
        round: 1,
        winner: null
    };
}

function createPlayer(playerId) {
    return {
        id: playerId,
        name: playerId,
        hand: [],
        playedCards: [],
        secretCards: [],
        discardedCards: [],
        actionTokens: [
            { type: 'secret', used: false },
            { type: 'trade-off', used: false },
            { type: 'gift', used: false },
            { type: 'competition', used: false }
        ]
    };
}

function createPlayerWithCards(playerId) {
    return {
        id: playerId,
        name: playerId,
        hand: generateInitialHand(),
        playedCards: [],
        secretCards: [],
        discardedCards: [],
        actionTokens: [
            { type: 'secret', used: false },
            { type: 'trade-off', used: false },
            { type: 'gift', used: false },
            { type: 'competition', used: false }
        ]
    };
}

function generateInitialHand() {
    const cards = [];
    for (let i = 0; i < 6; i++) {
        cards.push({
            id: `card-${Math.random().toString(36).substring(2)}`,
            geishaId: Math.floor(Math.random() * 7) + 1,
            type: '物品'
        });
    }
    return cards;
}

function createInitialGeishas() {
    return [
        { id: 1, name: '洋子', charmPoints: 2, controlledBy: null },
        { id: 2, name: '彩葉', charmPoints: 2, controlledBy: null },
        { id: 3, name: '琉璃', charmPoints: 2, controlledBy: null },
        { id: 4, name: '杏樹', charmPoints: 3, controlledBy: null },
        { id: 5, name: '知世', charmPoints: 3, controlledBy: null },
        { id: 6, name: '美櫻', charmPoints: 4, controlledBy: null },
        { id: 7, name: '小雪', charmPoints: 5, controlledBy: null },
    ];
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 使用動態端口
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 伺服器運行在 port ${PORT}`);
    console.log(`🌍 環境: ${process.env.NODE_ENV}`);
    console.log(`⚡ WebSocket 伺服器已啟動`);
    console.log(`📊 CORS 允許的域名:`, [
        'http://localhost:3000',
        'https://holo-koji-frontend.onrender.com',
        'https://newhandarky.github.io',
        'https://newhandarky.github.io/holo-koji',
        'https://newhandarky.github.io/holo-koji/'
    ]);
});