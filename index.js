// server/index.js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

/*
 * 建立 Express 應用與 HTTP 伺服器
 */
const app = express();
const server = createServer(app);

// 中介軟體設置
app.use(cors());                    // 允許跨域請求
app.use(express.json());           // 解析 JSON 請求體

/*
 * 遊戲房間管理
 */
const gameRooms = new Map();       // 儲存所有遊戲房間

/*
 * WebSocket 伺服器
 */
const wss = new WebSocketServer({ server });

/*
 * 遊戲房間類別
 * 管理房間內的玩家和遊戲狀態
 */
class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;            // 房間 ID
        this.players = [];               // 玩家陣列 { playerId, ws }
        this.gameState = null;           // 遊戲狀態
        this.maxPlayers = 2;             // 最大玩家數
    }

    /*
     * 添加玩家到房間
     * @param playerId 玩家 ID
     * @param ws WebSocket 連線
     * @returns boolean 是否成功加入
     */
    addPlayer(playerId, ws) {
        if (this.players.length < this.maxPlayers) {
            this.players.push({ playerId, ws });
            console.log(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}，當前玩家數：${this.players.length}`);
            return true;
        }
        return false;
    }

    /*
     * 移除玩家
     * @param playerId 玩家 ID
     */
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.playerId !== playerId);
        console.log(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}，當前玩家數：${this.players.length}`);
    }

    /*
     * 廣播訊息給房間內所有玩家
     * @param message 訊息物件
     * @param excludePlayerId 排除的玩家 ID
     */
    broadcast(message, excludePlayerId = null) {
        console.log(`📢 房間 ${this.roomId} 廣播訊息:`, message);
        this.players.forEach(player => {
            if (player.playerId !== excludePlayerId && player.ws.readyState === 1) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }

    /*
     * 檢查房間是否滿員
     */
    isFull() {
        return this.players.length === this.maxPlayers;
    }
}

/*
 * WebSocket 連接處理
 */
wss.on('connection', (ws) => {
    console.log('🔌 客戶端已連接');

    let currentPlayerId = null;        // 當前玩家 ID
    let currentRoomId = null;          // 當前房間 ID

    /*
     * 處理接收到的訊息
     */
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log('📨 收到訊息:', message);

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

    /*
     * 處理連線關閉
     */
    ws.on('close', () => {
        if (currentRoomId && currentPlayerId) {
            handleLeaveRoom(ws);
        }
        console.log('🔌 客戶端已斷線');
    });

    /*
     * 建立房間處理函數
     */
    function handleCreateRoom(ws, payload) {
        const roomId = generateRoomId();              // 生成房間 ID
        const room = new GameRoom(roomId);            // 建立新房間
        gameRooms.set(roomId, room);                 // 儲存房間

        currentPlayerId = payload.playerId;
        currentRoomId = roomId;

        room.addPlayer(currentPlayerId, ws);         // 加入房間

        console.log(`🏠 房間 ${roomId} 已建立，創建者：${currentPlayerId}`);

        // 發送房間建立成功回應
        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { roomId, playerId: currentPlayerId }
        }));

        // 初始化等待中的遊戲狀態
        const initialGameState = createWaitingGameState(roomId, [currentPlayerId]);
        room.gameState = initialGameState;

        // 發送初始遊戲狀態
        ws.send(JSON.stringify({
            type: 'GAME_STATE_UPDATED',
            payload: initialGameState
        }));
    }

    /*
     * 加入房間處理函數
     */
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

        console.log(`👤 玩家 ${playerId} 加入房間 ${roomId}`);

        // 通知加入者
        ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            payload: { playerId, roomId }
        }));

        // 如果房間滿了，開始遊戲
        if (room.isFull()) {
            console.log(`🎮 房間 ${roomId} 已滿，開始遊戲`);
            startGame(room);
        } else {
            // 更新等待狀態給所有玩家
            const waitingGameState = createWaitingGameState(roomId, room.players.map(p => p.playerId));
            room.gameState = waitingGameState;

            room.broadcast({
                type: 'GAME_STATE_UPDATED',
                payload: waitingGameState
            });
        }
    }

    /*
     * 遊戲動作處理函數
     */
    function handleGameAction(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (room) {
            // 廣播遊戲動作給房間內其他玩家
            room.broadcast({
                type: 'GAME_ACTION',
                payload: { ...payload, playerId: currentPlayerId }
            }, currentPlayerId);
        }
    }

    /*
     * 離開房間處理函數
     */
    function handleLeaveRoom(ws) {
        if (currentRoomId && currentPlayerId) {
            const room = gameRooms.get(currentRoomId);
            if (room) {
                room.removePlayer(currentPlayerId);
                room.broadcast({
                    type: 'PLAYER_LEFT',
                    payload: { playerId: currentPlayerId }
                });

                // 如果房間空了，刪除房間
                if (room.players.length === 0) {
                    gameRooms.delete(currentRoomId);
                    console.log(`🗑️ 房間 ${currentRoomId} 已刪除`);
                }
            }
        }
    }
});

/*
 * 開始遊戲
 */
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
}

/*
 * 建立等待中的遊戲狀態
 */
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

/*
 * 建立完整遊戲狀態
 */
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

/*
 * 建立玩家（無卡片）
 */
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

/*
 * 建立玩家（含卡片）
 */
function createPlayerWithCards(playerId) {
    return {
        id: playerId,
        name: playerId,
        hand: generateInitialHand(),        // 生成初始手牌
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

/*
 * 生成初始手牌（6 張卡片）
 */
function generateInitialHand() {
    const cards = [];
    for (let i = 0; i < 6; i++) {
        cards.push({
            id: `card-${Math.random().toString(36).substring(2)}`,
            geishaId: Math.floor(Math.random() * 7) + 1,    // 1-7 對應藝妓
            type: '物品'
        });
    }
    return cards;
}

/*
 * 建立初始藝妓狀態
 */
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

/*
 * 生成隨機房間 ID
 */
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/*
 * 啟動伺服器
 */
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`🚀 伺服器運行在 http://localhost:${PORT}`);
});