// server/index.js - 添加隨機順序決定功能
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import {
    DEFAULT_GEISHA_SET,
    createRandomizedGeishas,
    buildDeckForGeishas,
    cloneGeishasForNextRound,
    cloneGeishas,
    createGameStateWithOrder,
    createPlayer,
    createWaitingGameState,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    sanitizePendingInteractionForViewer
} from './utils/gameUtils.js';
import {
    deleteRoomSnapshot,
    isRedisEnabled,
    loadRoomSnapshot,
    saveRoomSnapshot
} from './utils/roomStore.js';
import {
    backendLogger,
    summarizeGameState,
    summarizeWebSocketMessage
} from './utils/runtimeLogger.js';

// NPC 設定（難度與思考時間）
const NPC_DIFFICULTY_LABEL = {
    easy: 'しぐれうい',
    medium: '大空スバル',
    hard: '兎田ぺこら',
    expert: '猫又おかゆ',
    hell: 'ときのそら'
};
const NPC_THINKING_DELAY = {
    easy: 1400,
    medium: 1000,
    hard: 700,
    expert: 500,
    hell: 350
};

const normalizeNpcDifficulty = (difficulty) => {
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' || difficulty === 'expert' || difficulty === 'hell') {
        return difficulty;
    }
    return 'easy';
};

const LEGACY_GEISHA_SET_ERROR_MESSAGE = '不支援舊版藝妓組合資料，請重新建立對戰。';
const LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE = '房間資料無效，請重新建立對戰。';
const GEISHA_SET_CONFIG_ERROR_MESSAGE = '角色組合資料設定錯誤，請重新建立對戰。';

const normalizePlayerMeta = (playerId, payload = {}) => {
    const displayName = typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim()
        : playerId;

    const lineUserId = typeof payload.lineUserId === 'string' && payload.lineUserId.trim()
        ? payload.lineUserId.trim()
        : undefined;

    const avatarUrl = typeof payload.avatarUrl === 'string' && payload.avatarUrl.trim()
        ? payload.avatarUrl.trim()
        : undefined;

    return {
        name: displayName,
        lineUserId,
        avatarUrl
    };
};

// 建立 Express 與 HTTP 伺服器
const app = express();
const server = createServer(app);

// CORS 設定（允許前端來源）
app.use(cors({
    origin: [
        'http://localhost:3000',
        'https://holo-koji-frontend.onrender.com',
        'https://newhandarky.github.io',
        'https://newhandarky.github.io/holo-koji',
        'https://newhandarky.github.io/holo-koji/'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 解析中介層
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

// 房間管理表（roomId → GameRoom）
const gameRooms = new Map();
// WebSocket 伺服器實體
const wss = new WebSocketServer({ server });

class GameRoom {
    constructor(roomId) {
        // 房間 ID
        this.roomId = roomId;
        // 房間建立時間
        this.createdAt = Date.now();
        // 房間內玩家列表
        this.players = [];
        // 遊戲狀態快照
        this.gameState = null;
        // 最大玩家數
        this.maxPlayers = 2;
        // 房主玩家 ID
        this.hostId = null;
        // 藝妓組合
        this.geishaSet = DEFAULT_GEISHA_SET;
        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };
        // 藝妓卡的基底資料（跨回合保留好感）
        this.baseGeishas = null;
        // 發牌動畫序列
        this.dealSequence = [];
        // 上一輪起始玩家 ID
        this.lastRoundStarterId = null;
        // 回合結算延遲計時器
        this.roundResolveTimer = null;
        // NPC 玩家資訊
        this.npcId = null;
        this.npcDifficulty = null;
        this.npcActionTimer = null;
        this.npcResponseTimer = null;
        // 再來一場確認集合
        this.rematchConfirmations = new Set();
        // 開局準備確認集合
        this.readyConfirmations = new Set();
    }

    // 產出可儲存的房間快照（不含連線物件）
    buildRoomSnapshot() {
        return {
            roomId: this.roomId,
            hostId: this.hostId,
            geishaSet: this.geishaSet,
            npcId: this.npcId,
            npcDifficulty: this.npcDifficulty,
            createdAt: this.createdAt,
            baseGeishas: this.baseGeishas,
            gameState: this.gameState
        };
    }

    // 儲存房間快照（Redis 可用時）
    persistRoomSnapshot() {
        if (!isRedisEnabled()) {
            return;
        }
        void saveRoomSnapshot(this.roomId, this.buildRoomSnapshot());
    }

    // 判斷是否為 NPC 玩家
    isNpcPlayerId(playerId) {
        return Boolean(this.npcId) && playerId === this.npcId;
    }

    // 建立 NPC 玩家（使用假連線避免廣播錯誤）
    addNpcPlayer(difficulty = 'easy') {
        if (this.npcId || this.players.length >= this.maxPlayers) {
            return null;
        }

        const normalized = normalizeNpcDifficulty(difficulty);
        const label = NPC_DIFFICULTY_LABEL[normalized] ?? NPC_DIFFICULTY_LABEL.easy;
        const npcId = `${label}`;
        const npcSocket = {
            readyState: 1,
            send: () => { }
        };

        this.players.push({
            playerId: npcId,
            ws: npcSocket,
            isNpc: true,
            name: npcId,
            lineUserId: undefined,
            avatarUrl: undefined
        });
        this.npcId = npcId;
        this.npcDifficulty = normalized;

        backendLogger.info(`🤖 NPC 玩家加入房間 ${this.roomId}`, {
            roomId: this.roomId,
            npcId,
            difficulty: normalized
        });
        return npcId;
    }

    getPlayerMetaMap() {
        return this.players.reduce((map, player) => {
            map[player.playerId] = {
                name: player.name ?? player.playerId,
                lineUserId: player.lineUserId,
                avatarUrl: player.avatarUrl
            };
            return map;
        }, {});
    }

    // 清除 NPC 計時器（避免重複執行）
    clearNpcTimers() {
        if (this.npcActionTimer) {
            clearTimeout(this.npcActionTimer);
            this.npcActionTimer = null;
        }
        if (this.npcResponseTimer) {
            clearTimeout(this.npcResponseTimer);
            this.npcResponseTimer = null;
        }
    }

    regenerateBaseGeishas() {
        try {
            this.baseGeishas = createRandomizedGeishas(this.geishaSet ?? DEFAULT_GEISHA_SET);
            return true;
        } catch (error) {
            backendLogger.error(`❌ 房間 ${this.roomId} 建立藝妓資料失敗`, {
                roomId: this.roomId,
                error: error instanceof Error ? error.message : 'unknown'
            });
            this.players.forEach((player) => {
                this.sendError(player.playerId, GEISHA_SET_CONFIG_ERROR_MESSAGE);
            });
            return false;
        }
    }

    ensureBaseGeishas() {
        if (this.baseGeishas) {
            return true;
        }

        return this.regenerateBaseGeishas();
    }

    // 送出再來一場請求
    requestRematch(playerId) {
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        this.rematchConfirmations.add(playerId);

        if (this.npcId) {
            this.rematchConfirmations.add(this.npcId);
        }

        if (this.rematchConfirmations.size >= 2) {
            this.startRematch();
        } else {
            this.broadcast({
                type: 'REMATCH_REQUESTED',
                payload: {
                    confirmations: Array.from(this.rematchConfirmations)
                }
            });
        }
    }

    // 開始準備確認流程
    startReadyCheck() {
        if (!this.gameState) {
            return;
        }

        const playerIds = this.players.map(player => player.playerId);
        this.readyConfirmations.clear();

        this.broadcast({
            type: 'READY_CHECK',
            payload: {
                confirmations: [],
                waitingFor: playerIds
            }
        });

        if (this.npcId) {
            const delay = NPC_THINKING_DELAY[this.npcDifficulty] ?? NPC_THINKING_DELAY.easy;
            setTimeout(() => {
                this.confirmReady(this.npcId);
            }, delay);
        }
    }

    // 玩家確認準備完成
    confirmReady(playerId) {
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        this.readyConfirmations.add(playerId);
        const waitingFor = this.players
            .map(player => player.playerId)
            .filter(id => !this.readyConfirmations.has(id));

        this.broadcast({
            type: 'READY_STATUS',
            payload: {
                confirmations: Array.from(this.readyConfirmations),
                waitingFor
            }
        });

        if (waitingFor.length === 0) {
            this.startGameWithOrder();
        }
    }

    // 重新開始對戰（保留同房間與玩家）
    startRematch() {
        backendLogger.info(`🔁 房間 ${this.roomId} 重新開始對戰`, {
            roomId: this.roomId,
            geishaSet: this.geishaSet
        });

        this.clearNpcTimers();
        this.rematchConfirmations.clear();
        this.lastRoundStarterId = null;
        if (!this.regenerateBaseGeishas()) {
            return;
        }
        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };

        this.startOrderDecision();
    }

    // 將訊息傳送給指定玩家（避免廣播時洩漏資訊）
    sendToPlayer(playerId, message) {
        const target = this.players.find(player => player.playerId === playerId);
        if (!target) {
            backendLogger.warn(`⚠️ 找不到玩家 ${playerId}，無法傳送訊息`, {
                roomId: this.roomId,
                playerId
            });
            return;
        }

        if (target.ws.readyState !== 1) {
            backendLogger.warn(`⚠️ 玩家 ${playerId} 連線狀態異常`, {
                roomId: this.roomId,
                playerId,
                readyState: target.ws.readyState
            });
            return;
        }

        try {
            target.ws.send(JSON.stringify(message));
            backendLogger.diagnostic('🐞 [Server] 傳送訊息摘要', {
                roomId: this.roomId,
                targetPlayerId: playerId,
                ...summarizeWebSocketMessage(message)
            });
        } catch (error) {
            backendLogger.error(`❌ 傳送訊息給玩家 ${playerId} 失敗`, {
                roomId: this.roomId,
                playerId,
                type: typeof message?.type === 'string' ? message.type : 'unknown',
                error: error instanceof Error ? error.message : 'unknown'
            });
        }
    }

    // 傳送錯誤訊息給指定玩家（統一錯誤回傳格式）
    sendError(playerId, message) {
        this.sendToPlayer(playerId, {
            type: 'ERROR',
            payload: { message }
        });
    }

    sendPendingInteractionState() {
        if (!this.gameState?.pendingInteraction) {
            return;
        }

        this.players.forEach((player) => {
            this.sendToPlayer(player.playerId, {
                type: 'PENDING_INTERACTION',
                payload: sanitizePendingInteractionForViewer(this.gameState.pendingInteraction, player.playerId)
            });
        });
    }

    // 將遊戲狀態整理成玩家可見版本（隱藏對手手牌與密約資訊）
    buildClientGameState(viewerId) {
        if (!this.gameState) {
            return null;
        }

        if (!this.gameState.geishaSet) {
            this.gameState.geishaSet = this.geishaSet ?? DEFAULT_GEISHA_SET;
        }

        const sanitizedPlayers = this.gameState.players.map((player) => {
            if (player.id === viewerId) {
                return player;
            }

            return {
                ...player,
                hand: createMaskedCards(player.hand.length, `${player.id}-hand`),
                secretCards: [],
                discardedCards: createMaskedCards(player.discardedCards.length, `${player.id}-discard`)
            };
        });

        return {
            ...this.gameState,
            players: sanitizedPlayers,
            drawPile: [],
            removedCard: null,
            pendingInteraction: sanitizePendingInteractionForViewer(this.gameState.pendingInteraction, viewerId)
        };
    }

    // 依玩家視角建立發牌動畫序列（只顯示自己的牌）
    buildDealSequenceForPlayer(playerId) {
        return this.dealSequence.map((step, index) => {
            if (step.playerId === playerId) {
                return step;
            }

            return {
                ...step,
                card: createMaskedCard(`${playerId}-deal`, index)
            };
        });
    }

    // 加入玩家到房間，並回傳加入結果
    addPlayer(playerId, ws, meta = {}) {
        // 基本檢查：避免空白 playerId
        if (!playerId) {
            backendLogger.warn('⚠️ 嘗試加入房間但 playerId 為空', {
                roomId: this.roomId
            });
            return 'invalid';
        }

        const normalizedMeta = normalizePlayerMeta(playerId, meta);
        const existingPlayer = this.players.find(player => player.playerId === playerId);

        if (existingPlayer) {
            existingPlayer.ws = ws;
            if (normalizedMeta.name) {
                existingPlayer.name = normalizedMeta.name;
            }
            if (normalizedMeta.lineUserId) {
                existingPlayer.lineUserId = normalizedMeta.lineUserId;
            }
            if (normalizedMeta.avatarUrl) {
                existingPlayer.avatarUrl = normalizedMeta.avatarUrl;
            }
            backendLogger.info(`♻️ 玩家 ${playerId} 重新連線房間 ${this.roomId}`, {
                roomId: this.roomId,
                playerId
            });
            this.persistRoomSnapshot();
            return 'existing';
        }

        if (this.players.length >= this.maxPlayers) {
            return 'full';
        }

        this.players.push({
            playerId,
            ws,
            name: normalizedMeta.name,
            lineUserId: normalizedMeta.lineUserId,
            avatarUrl: normalizedMeta.avatarUrl
        });
        backendLogger.info(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}`, {
            roomId: this.roomId,
            playerId,
            playerCount: this.players.length
        });
        this.persistRoomSnapshot();
        return 'added';
    }

    // 從房間移除玩家
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.playerId !== playerId);
        backendLogger.info(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}`, {
            roomId: this.roomId,
            playerId,
            playerCount: this.players.length
        });
        this.persistRoomSnapshot();
    }

    // 廣播訊息給房間內所有玩家（非狀態同步使用）
    broadcast(message, excludePlayerId = null) {
        let successCount = 0;
        this.players.forEach((player, index) => {
            if (player.playerId !== excludePlayerId) {
                if (player.ws.readyState === 1) {
                    try {
                        player.ws.send(JSON.stringify(message));
                        successCount++;
                    } catch (error) {
                        backendLogger.error(`❌ 房間 ${this.roomId} 廣播失敗`, {
                            roomId: this.roomId,
                            playerId: player.playerId,
                            type: typeof message?.type === 'string' ? message.type : 'unknown',
                            error: error instanceof Error ? error.message : 'unknown'
                        });
                    }
                } else {
                    backendLogger.warn(`⚠️ 房間 ${this.roomId} 廣播時玩家連線狀態異常`, {
                        roomId: this.roomId,
                        playerId: player.playerId,
                        readyState: player.ws.readyState
                    });
                }
            }
        });

        backendLogger.diagnostic('🐞 [Server] 廣播訊息摘要', {
            roomId: this.roomId,
            successCount,
            playerCount: this.players.length,
            excludedPlayerId: excludePlayerId ?? undefined,
            ...summarizeWebSocketMessage(message)
        });
    }

    // 檢查房間是否已滿員
    isFull() {
        return this.players.length === this.maxPlayers;
    }

    // 準備新回合的初始狀態（洗牌、移除卡、發牌）
    prepareRoundState({ orderedPlayerIds = null, roundNumber = null, openOrderDecision = true } = {}) {
        const playerIds = orderedPlayerIds ?? this.players.map(p => p.playerId);

        if (playerIds.length < 2) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 嘗試準備回合，但玩家不足`, {
                roomId: this.roomId,
                playerCount: playerIds.length
            });
            return;
        }

        if (!this.ensureBaseGeishas()) {
            return;
        }

        // 以 baseGeishas 為基礎建立本回合藝妓資料
        const geishasClone = cloneGeishas(this.baseGeishas);
        const { deck, removedCard } = buildDeckForGeishas(geishasClone);

        const dealingDeck = [...deck];
        const dealSequence = [];
        const playersState = playerIds.map((id) => createPlayer(id));

        // 每位玩家發 6 張手牌
        for (let round = 0; round < 6; round += 1) {
            playerIds.forEach((playerId, index) => {
                const dealtCard = dealingDeck.shift();
                if (!dealtCard) {
                    backendLogger.error(`❌ 房間 ${this.roomId} 發牌時牌庫不足`, {
                        roomId: this.roomId,
                        remainingDeckSize: dealingDeck.length
                    });
                    return;
                }

                playersState[index].hand.push(dealtCard);
                dealSequence.push({
                    order: dealSequence.length,
                    playerId,
                    card: dealtCard
                });
            });
        }

        this.dealSequence = dealSequence;

        const resolvedRound = roundNumber ?? this.gameState?.round ?? 1;

        // 組合本回合遊戲狀態
        this.gameState = {
            gameId: this.roomId,
            hostId: this.hostId,
            players: playersState,
            geishas: geishasClone,
            currentPlayer: 0,
            phase: openOrderDecision ? 'deciding_order' : 'playing',
            round: resolvedRound,
            winner: null,
            orderDecision: {
                isOpen: openOrderDecision,
                phase: openOrderDecision ? 'deciding' : 'result',
                players: playerIds,
                result: openOrderDecision ? undefined : {
                    firstPlayer: playerIds[0],
                    secondPlayer: playerIds[1],
                    order: playerIds
                },
                confirmations: openOrderDecision ? [] : [...playerIds],
                waitingFor: openOrderDecision ? playerIds : [],
                currentPlayer: playerIds[0]
            },
            drawPile: dealingDeck,
            discardPile: [],
            removedCard,
            pendingInteraction: null,
            lastAction: undefined
        };

        backendLogger.info(`🃏 房間 ${this.roomId} 已準備新回合`, {
            roomId: this.roomId,
            dealSequenceLength: this.dealSequence.length,
            ...summarizeGameState(this.gameState)
        });

        // 回合初始化檢查（避免發牌數量或重複卡異常）
        this.validateRoundSetup();
    }

    // 開始隨機決定順序
    startOrderDecision() {
        backendLogger.info(`🎲 房間 ${this.roomId} 開始隨機決定玩家順序`, {
            roomId: this.roomId
        });

        this.prepareRoundState({ openOrderDecision: true });
        this.orderDecisionState.isDeciding = true;
        this.orderDecisionState.confirmations.clear();

        // 廣播開始決定順序
        this.broadcast({
            type: 'ORDER_DECISION_START',
            payload: {
                players: this.players.map(p => p.playerId)
            }
        });

        if (this.gameState) {
            this.broadcastGameState();
        }

        // 延遲 2 秒後顯示結果（模擬隨機過程）
        setTimeout(() => {
            this.decideOrder();
        }, 2000);
    }

    // 決定順序並廣播結果
    decideOrder() {
        const playerIds = this.players.map(p => p.playerId);

        // 隨機決定誰先手
        const firstPlayerIndex = Math.random() < 0.5 ? 0 : 1;
        const firstPlayer = playerIds[firstPlayerIndex];
        const secondPlayer = playerIds[1 - firstPlayerIndex];

        this.orderDecisionState.result = {
            firstPlayer,
            secondPlayer,
            order: [firstPlayer, secondPlayer]
        };

        backendLogger.info(`🎲 房間 ${this.roomId} 順序決定完成`, {
            roomId: this.roomId,
            firstPlayer: firstPlayer,
            secondPlayer: secondPlayer
        });

        if (this.gameState) {
            const order = this.orderDecisionState.result.order;
            this.gameState.players = order
                .map(playerId => this.gameState.players.find(player => player.id === playerId))
                .filter(Boolean);

            this.gameState.currentPlayer = 0;
            this.gameState.orderDecision = {
                ...this.gameState.orderDecision,
                phase: 'result',
                result: this.orderDecisionState.result,
                confirmations: [],
                waitingFor: [...order]
            };
        }

        // 廣播結果
        this.broadcast({
            type: 'ORDER_DECISION_RESULT',
            payload: this.orderDecisionState.result
        });

        if (this.gameState) {
            this.broadcastGameState();
        }

        // 若有 NPC，順序決定後自動確認
        if (this.npcId) {
            const delay = NPC_THINKING_DELAY[this.npcDifficulty] ?? NPC_THINKING_DELAY.easy;
            setTimeout(() => {
                this.confirmOrder(this.npcId);
            }, delay);
        }
    }

    // 處理玩家確認
    confirmOrder(playerId) {
        // 確認玩家在房間內
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        if (!this.orderDecisionState.result) {
            backendLogger.warn(`⚠️ 玩家 ${playerId} 嘗試確認，但順序尚未決定`, {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '順序尚未決定，請稍後再確認');
            return;
        }

        this.orderDecisionState.confirmations.add(playerId);
        backendLogger.info(`✅ 玩家 ${playerId} 已確認順序`, {
            roomId: this.roomId,
            playerId,
            confirmations: this.orderDecisionState.confirmations.size
        });

        if (this.gameState) {
            this.gameState.orderDecision = {
                ...this.gameState.orderDecision,
                confirmations: Array.from(this.orderDecisionState.confirmations),
                waitingFor: this.players
                    .map(p => p.playerId)
                    .filter(id => !this.orderDecisionState.confirmations.has(id))
            };
        }

        // 廣播確認狀態
        this.broadcast({
            type: 'ORDER_CONFIRMATION_UPDATE',
            payload: {
                confirmations: Array.from(this.orderDecisionState.confirmations),
                waitingFor: this.players
                    .map(p => p.playerId)
                    .filter(id => !this.orderDecisionState.confirmations.has(id))
            }
        });

        if (this.gameState) {
            this.broadcastGameState();
        }

        // 如果所有玩家都確認了，開始遊戲
        if (this.orderDecisionState.confirmations.size === 2) {
            setTimeout(() => {
                this.startReadyCheck();
            }, 800);
        }
    }

    // 根據決定的順序開始遊戲
    startGameWithOrder() {
        const { order } = this.orderDecisionState.result;
        if (!this.ensureBaseGeishas()) {
            return;
        }
        const { gameState } = createGameStateWithOrder(
            this.roomId,
            order,
            this.baseGeishas,
            this.gameState,
            this.getPlayerMetaMap()
        );
        this.gameState = gameState;
        this.lastRoundStarterId = order[0];

        backendLogger.info(`🚀 遊戲開始`, {
            roomId: this.roomId,
            geishaSet: this.geishaSet,
            firstPlayer: order[0],
            secondPlayer: order[1]
        });

        // 廣播遊戲開始事件（含可見狀態）
        this.broadcastGameStateEvent('GAME_STARTED');

        // 確認進入遊戲後再開始發牌動畫
        if (this.dealSequence.length > 0) {
            this.players.forEach((player) => {
                this.sendToPlayer(player.playerId, {
                    type: 'DEAL_ANIMATION',
                    payload: {
                        sequence: this.buildDealSequenceForPlayer(player.playerId)
                    }
                });
            });
        }

        this.beginTurnForCurrentPlayer();

        // 重置順序決定狀態
        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };
    }

    // 傳送指定事件與可見遊戲狀態（避免資料外洩）
    broadcastGameStateEvent(eventType) {
        if (!this.gameState) {
            return;
        }

        this.players.forEach((player) => {
            const payload = this.buildClientGameState(player.playerId);
            if (payload) {
                this.sendToPlayer(player.playerId, {
                    type: eventType,
                    payload
                });
            }
        });

        this.persistRoomSnapshot();
    }

    // 廣播可見狀態（標準狀態同步事件）
    broadcastGameState() {
        this.broadcastGameStateEvent('GAME_STATE_UPDATED');
    }

    // 取得玩家的遊戲狀態資料
    getPlayerState(playerId) {
        if (!this.gameState) {
            return null;
        }

        return this.gameState.players.find(player => player.id === playerId) ?? null;
    }

    // 取得對手玩家 ID
    getOpponentId(playerId) {
        return this.players
            .map(player => player.playerId)
            .find(id => id !== playerId) ?? null;
    }

    // 取得對手玩家狀態
    getOpponentState(playerId) {
        const opponentId = this.getOpponentId(playerId);
        if (!opponentId) {
            return null;
        }
        return this.getPlayerState(opponentId);
    }

    // 標記玩家行動指示物已使用
    markActionTokenUsed(player, actionType) {
        const token = player.actionTokens.find(item => item.type === actionType);
        if (token) {
            token.used = true;
        }
    }

    // 抽牌給指定玩家（從牌堆頂端）
    drawCardForPlayer(player) {
        if (!this.gameState || this.gameState.drawPile.length === 0) {
            return null;
        }

        const card = this.gameState.drawPile.shift();
        if (card) {
            player.hand.push(card);
        }
        return card ?? null;
    }

    // 開始當前玩家回合（抽牌、重置互動狀態）
    beginTurnForCurrentPlayer() {
        if (!this.gameState) {
            return;
        }

        const currentPlayer = this.gameState.players[this.gameState.currentPlayer];

        if (!currentPlayer) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 找不到當前玩家資料`, {
                roomId: this.roomId
            });
            return;
        }

        if (currentPlayer.actionTokens.every(token => token.used)) {
            backendLogger.info(`🔄 玩家 ${currentPlayer.id} 已無可用行動，跳到下一位`, {
                roomId: this.roomId,
                playerId: currentPlayer.id
            });
            this.endTurn();
            return;
        }

        // 抽牌並依玩家視角廣播
        const drawnCard = this.drawCardForPlayer(currentPlayer);
        if (drawnCard) {
            this.players.forEach((player) => {
                const visibleCard = player.playerId === currentPlayer.id
                    ? drawnCard
                    : createMaskedCard(`draw-${currentPlayer.id}`, 0);

                this.sendToPlayer(player.playerId, {
                    type: 'CARD_DRAWN',
                    payload: {
                        playerId: currentPlayer.id,
                        card: visibleCard
                    }
                });
            });
        }

        this.gameState.phase = 'playing';
        this.gameState.pendingInteraction = null;
        this.gameState.lastAction = undefined;

        this.broadcastGameState();

        // 若輪到 NPC，安排自動行動
        if (this.isNpcPlayerId(currentPlayer.id)) {
            this.scheduleNpcTurn();
        }
    }

    // 安排 NPC 行動
    scheduleNpcTurn() {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const currentPlayer = this.gameState.players[this.gameState.currentPlayer];
        if (!currentPlayer || currentPlayer.id !== this.npcId) {
            return;
        }

        if (this.gameState.phase !== 'playing' || this.gameState.pendingInteraction) {
            return;
        }

        const delay = NPC_THINKING_DELAY[this.npcDifficulty] ?? NPC_THINKING_DELAY.easy;
        if (this.npcActionTimer) {
            clearTimeout(this.npcActionTimer);
        }

        this.npcActionTimer = setTimeout(() => {
            this.npcActionTimer = null;
            this.performNpcAction();
        }, delay);
    }

    // 安排 NPC 回應互動（贈予/競爭）
    scheduleNpcResponse() {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const pending = this.gameState.pendingInteraction;
        if (!pending || pending.targetPlayerId !== this.npcId) {
            return;
        }

        const delay = NPC_THINKING_DELAY[this.npcDifficulty] ?? NPC_THINKING_DELAY.easy;
        if (this.npcResponseTimer) {
            clearTimeout(this.npcResponseTimer);
        }

        this.npcResponseTimer = setTimeout(() => {
            this.npcResponseTimer = null;
            this.performNpcResponse();
        }, delay);
    }

    // 取得藝妓的魅力值
    getGeishaCharmPoints(geishaId) {
        return this.gameState?.geishas?.find(geisha => geisha.id === geishaId)?.charmPoints ?? 0;
    }

    // 建立藝妓計數快照（用於 AI 評估）
    buildGeishaCountSnapshot(npcPlayer, opponentPlayer) {
        const snapshot = new Map();
        const geishas = this.gameState?.geishas ?? [];

        geishas.forEach((geisha) => {
            const npcCount = npcPlayer.playedCards.filter(card => card.geishaId === geisha.id).length;
            const oppCount = opponentPlayer.playedCards.filter(card => card.geishaId === geisha.id).length;
            snapshot.set(geisha.id, {
                npc: npcCount,
                opp: oppCount,
                charm: geisha.charmPoints
            });
        });

        return snapshot;
    }

    // 計算單張卡片對指定玩家的價值（考慮追趕與翻盤）
    getCardUtility(snapshot, geishaId, isNpc) {
        const entry = snapshot.get(geishaId);
        if (!entry) {
            return 0;
        }

        const myCount = isNpc ? entry.npc : entry.opp;
        const oppCount = isNpc ? entry.opp : entry.npc;
        const charm = entry.charm;

        if (myCount + 1 > oppCount && myCount <= oppCount) {
            return charm * 4; // 翻盤或搶先的價值最高
        }

        if (myCount + 1 === oppCount) {
            return charm * 2; // 追平有一定價值
        }

        return charm; // 其他情況以魅力值基礎評估
    }

    // 計算當前分數差（AI 評估用）
    evaluateSnapshot(snapshot) {
        let npcScore = 0;
        let oppScore = 0;

        snapshot.forEach((entry) => {
            const base = entry.charm * 2;
            const diff = entry.npc - entry.opp;

            npcScore += base + diff * 3;
            oppScore += base - diff * 3;
        });

        return npcScore - oppScore;
    }

    // 將卡片套用到快照（模擬結果）
    applyCardsToSnapshot(snapshot, geishaIdList, isNpc) {
        const next = new Map();
        snapshot.forEach((value, key) => {
            next.set(key, { ...value });
        });

        geishaIdList.forEach((geishaId) => {
            const entry = next.get(geishaId);
            if (!entry) {
                return;
            }
            if (isNpc) {
                entry.npc += 1;
            } else {
                entry.opp += 1;
            }
        });

        return next;
    }

    // NPC 執行回合行動
    performNpcAction() {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const npcPlayer = this.getPlayerState(this.npcId);
        if (!npcPlayer || this.gameState.currentPlayer >= this.gameState.players.length) {
            return;
        }

        if (this.gameState.players[this.gameState.currentPlayer]?.id !== this.npcId) {
            return;
        }

        if (this.gameState.pendingInteraction || this.gameState.phase !== 'playing') {
            return;
        }

        const action = this.buildNpcAction(npcPlayer);
        if (!action) {
            this.endTurn();
            return;
        }

        this.handleAction(this.npcId, action);
    }

    // NPC 回應互動（贈予/競爭）
    performNpcResponse() {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const pending = this.gameState.pendingInteraction;
        if (!pending || pending.targetPlayerId !== this.npcId) {
            return;
        }

        if (pending.type === 'GIFT_SELECTION') {
            const card = this.pickNpcGiftCard(pending.offeredCards);
            if (card) {
                this.handleAction(this.npcId, { type: 'RESOLVE_GIFT', payload: { chosenCardId: card.id } });
            }
            return;
        }

        if (pending.type === 'COMPETITION_SELECTION') {
            const index = this.pickNpcCompetitionGroup(pending.groups);
            if (index !== null) {
                this.handleAction(this.npcId, { type: 'RESOLVE_COMPETITION', payload: { chosenGroupIndex: index } });
            }
        }
    }

    // NPC 決定要執行的行動與卡片
    buildNpcAction(player) {
        const opponent = this.getOpponentState(player.id);
        if (!opponent) {
            return null;
        }

        const available = player.actionTokens.filter(token => !token.used).map(token => token.type);
        const hasCards = player.hand.length;

        const candidates = available.filter((type) => {
            if (type === 'secret') return hasCards >= 1;
            if (type === 'trade-off') return hasCards >= 2;
            if (type === 'gift') return hasCards >= 3;
            if (type === 'competition') return hasCards >= 4;
            return false;
        });

        if (candidates.length === 0) {
            return null;
        }

        const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];
        const snapshot = this.buildGeishaCountSnapshot(player, opponent);
        const sortedByNpcValue = [...player.hand]
            .sort((a, b) => this.getCardUtility(snapshot, a.geishaId, true) - this.getCardUtility(snapshot, b.geishaId, true));

        let actionType = pickRandom(candidates);

        if (this.npcDifficulty === 'expert' || this.npcDifficulty === 'hell') {
            actionType = this.pickBestNpcAction(player, opponent, candidates) ?? actionType;
        } else if (this.npcDifficulty !== 'easy') {
            if (candidates.includes('competition')) {
                actionType = 'competition';
            } else if (candidates.includes('gift')) {
                actionType = 'gift';
            } else if (candidates.includes('secret')) {
                actionType = 'secret';
            } else {
                actionType = 'trade-off';
            }
        }

        if (actionType === 'secret') {
            const card = this.npcDifficulty === 'easy'
                ? pickRandom(player.hand)
                : sortedByNpcValue[sortedByNpcValue.length - 1];
            return { type: 'PLAY_SECRET', payload: { cardId: card.id } };
        }

        if (actionType === 'trade-off') {
            const selected = this.npcDifficulty === 'easy'
                ? this.pickRandomCards(player.hand, 2)
                : this.pickTradeOffCards(player, opponent);
            return { type: 'PLAY_TRADE_OFF', payload: { cardIds: selected.map(card => card.id) } };
        }

        if (actionType === 'gift') {
            const selected = this.npcDifficulty === 'easy'
                ? this.pickRandomCards(player.hand, 3)
                : this.pickGiftCards(player, opponent);
            return { type: 'INITIATE_GIFT', payload: { cardIds: selected.map(card => card.id) } };
        }

        if (actionType === 'competition') {
            const picked = this.npcDifficulty === 'easy'
                ? this.pickRandomCards(player.hand, 4)
                : this.pickCompetitionCards(player, opponent);
            const groups = this.npcDifficulty === 'easy'
                ? this.buildNpcRandomGroups(picked)
                : this.buildNpcCompetitionGroups(picked, player, opponent);
            return { type: 'INITIATE_COMPETITION', payload: { groups } };
        }

        return null;
    }

    // 隨機挑選指定數量卡片
    pickRandomCards(cards, count) {
        const pool = [...cards];
        const picked = [];
        while (pool.length > 0 && picked.length < count) {
            const index = Math.floor(Math.random() * pool.length);
            picked.push(pool.splice(index, 1)[0]);
        }
        return picked;
    }

    // 競爭分組策略（盡量平衡）
    buildNpcCompetitionGroups(cards, npcPlayer, opponent) {
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        const sorted = [...cards].sort((a, b) => this.getCardValue(b) - this.getCardValue(a));
        if (sorted.length < 4) {
            return [
                sorted.slice(0, 2).map(card => card.id),
                sorted.slice(2, 4).map(card => card.id)
            ].filter(group => group.length > 0);
        }

        const groupA = [sorted[0], sorted[3]];
        const groupB = [sorted[1], sorted[2]];
        const groupOptions = [
            [groupA.map(card => card.id), groupB.map(card => card.id)],
            [[sorted[0], sorted[2]].map(card => card.id), [sorted[1], sorted[3]].map(card => card.id)],
            [[sorted[0], sorted[1]].map(card => card.id), [sorted[2], sorted[3]].map(card => card.id)]
        ];

        const idToGeisha = new Map(sorted.map(card => [card.id, card.geishaId]));

        // 選擇讓對手最難下決定的一組（最大化最差結果）
        let best = groupOptions[0];
        let bestScore = -Infinity;

        groupOptions.forEach((option) => {
            const [g1, g2] = option;
            const g1Geishas = g1.map(cardId => idToGeisha.get(cardId)).filter(Boolean);
            const g2Geishas = g2.map(cardId => idToGeisha.get(cardId)).filter(Boolean);
            const worst = Math.min(
                this.evaluateSnapshot(this.applyCardsToSnapshot(snapshot, g1Geishas, false)),
                this.evaluateSnapshot(this.applyCardsToSnapshot(snapshot, g2Geishas, false))
            );
            if (worst > bestScore) {
                bestScore = worst;
                best = option;
            }
        });

        return best;
    }

    // 競爭分組（隨機）
    buildNpcRandomGroups(cards) {
        const pool = [...cards];
        for (let i = pool.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return [
            pool.slice(0, 2).map(card => card.id),
            pool.slice(2, 4).map(card => card.id)
        ];
    }

    // NPC 回應贈予：挑選價值最高的卡片
    pickNpcGiftCard(cards) {
        if (!cards || cards.length === 0) {
            return null;
        }

        if (this.npcDifficulty === 'easy') {
            return cards[Math.floor(Math.random() * cards.length)];
        }

        const npcPlayer = this.getPlayerState(this.npcId);
        const opponent = this.getOpponentState(this.npcId);
        if (!npcPlayer || !opponent) {
            return cards[0];
        }
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        return [...cards]
            .sort((a, b) => this.getCardUtility(snapshot, b.geishaId, true) - this.getCardUtility(snapshot, a.geishaId, true))[0];
    }

    // NPC 回應競爭：挑選總分較高的一組
    pickNpcCompetitionGroup(groups) {
        if (!groups || groups.length !== 2) {
            return null;
        }

        if (this.npcDifficulty === 'easy') {
            return Math.random() < 0.5 ? 0 : 1;
        }

        const npcPlayer = this.getPlayerState(this.npcId);
        const opponent = this.getOpponentState(this.npcId);
        if (!npcPlayer || !opponent) {
            return 0;
        }
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        const score = (group) => this.evaluateSnapshot(this.applyCardsToSnapshot(snapshot, group.map(card => card.geishaId), true));
        return score(groups[0]) >= score(groups[1]) ? 0 : 1;
    }

    // 專家模式：在可用行動中挑選期望收益最高者
    pickBestNpcAction(npcPlayer, opponent, candidates) {
        if (!candidates || candidates.length === 0) {
            return null;
        }

        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        let bestAction = null;
        let bestScore = -Infinity;

        candidates.forEach((actionType) => {
            const score = this.evaluateNpcAction(npcPlayer, opponent, snapshot, actionType);
            if (score > bestScore) {
                bestScore = score;
                bestAction = actionType;
            }
        });

        return bestAction;
    }

    // 評估行動的期望收益（越高越好）
    evaluateNpcAction(npcPlayer, opponent, snapshot, actionType) {
        if (actionType === 'secret') {
            const bestCard = [...npcPlayer.hand]
                .sort((a, b) => this.getCardUtility(snapshot, b.geishaId, true) - this.getCardUtility(snapshot, a.geishaId, true))[0];
            if (!bestCard) {
                return -Infinity;
            }
            const next = this.applyCardsToSnapshot(snapshot, [bestCard.geishaId], true);
            return this.evaluateSnapshot(next);
        }

        if (actionType === 'trade-off') {
            const discard = this.pickTradeOffCards(npcPlayer, opponent);
            const loss = discard.reduce((sum, card) => sum + this.getCardUtility(snapshot, card.geishaId, true), 0);
            return this.evaluateSnapshot(snapshot) - loss;
        }

        if (actionType === 'gift') {
            const offered = this.pickGiftCards(npcPlayer, opponent);
            if (offered.length < 3) {
                return -Infinity;
            }
            const worst = Math.min(...offered.map((chosen) => {
                const npcCards = offered.filter(card => card.id !== chosen.id);
                const next = this.applyCardsToSnapshot(
                    this.applyCardsToSnapshot(snapshot, [chosen.geishaId], false),
                    npcCards.map(card => card.geishaId),
                    true
                );
                return this.evaluateSnapshot(next);
            }));
            return worst;
        }

        if (actionType === 'competition') {
            const picked = this.pickCompetitionCards(npcPlayer, opponent);
            if (picked.length < 4) {
                return -Infinity;
            }
            const [groupA, groupB] = this.buildNpcCompetitionGroups(picked, npcPlayer, opponent);
            const idToGeisha = new Map(picked.map(card => [card.id, card.geishaId]));
            const g1 = groupA.map(cardId => idToGeisha.get(cardId)).filter(Boolean);
            const g2 = groupB.map(cardId => idToGeisha.get(cardId)).filter(Boolean);
            const worst = Math.min(
                this.evaluateSnapshot(this.applyCardsToSnapshot(snapshot, g1, false)),
                this.evaluateSnapshot(this.applyCardsToSnapshot(snapshot, g2, false))
            );
            return worst;
        }

        return -Infinity;
    }

    // 競爭挑選卡片（偏強：用評分選出最有利的 4 張）
    pickCompetitionCards(npcPlayer, opponent) {
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        const scored = [...npcPlayer.hand].sort((a, b) => {
            const diff = this.getCardUtility(snapshot, b.geishaId, true) - this.getCardUtility(snapshot, a.geishaId, true);
            return diff;
        });
        return scored.slice(0, 4);
    }

    // 贈予挑選卡片（偏強：最大化最差結果）
    pickGiftCards(npcPlayer, opponent) {
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        const cards = npcPlayer.hand;
        let bestCombo = cards.slice(0, 3);
        let bestScore = -Infinity;

        for (let i = 0; i < cards.length; i += 1) {
            for (let j = i + 1; j < cards.length; j += 1) {
                for (let k = j + 1; k < cards.length; k += 1) {
                    const combo = [cards[i], cards[j], cards[k]];
                    const opponentChoices = combo.map(card => card);

                    const worst = Math.min(...opponentChoices.map((chosen) => {
                        const npcCards = combo.filter(card => card.id !== chosen.id);
                        const next = this.applyCardsToSnapshot(
                            this.applyCardsToSnapshot(snapshot, [chosen.geishaId], false),
                            npcCards.map(card => card.geishaId),
                            true
                        );
                        return this.evaluateSnapshot(next);
                    }));

                    if (worst > bestScore) {
                        bestScore = worst;
                        bestCombo = combo;
                    }
                }
            }
        }

        return bestCombo;
    }

    // 取捨挑選卡片（偏強：犧牲價值最低且可能阻止對手的牌）
    pickTradeOffCards(npcPlayer, opponent) {
        const snapshot = this.buildGeishaCountSnapshot(npcPlayer, opponent);
        const sorted = [...npcPlayer.hand].sort((a, b) => {
            const npcValueA = this.getCardUtility(snapshot, a.geishaId, true);
            const npcValueB = this.getCardUtility(snapshot, b.geishaId, true);
            const oppValueA = this.getCardUtility(snapshot, a.geishaId, false);
            const oppValueB = this.getCardUtility(snapshot, b.geishaId, false);

            const scoreA = npcValueA - oppValueA * 0.6;
            const scoreB = npcValueB - oppValueB * 0.6;
            return scoreA - scoreB;
        });

        return sorted.slice(0, 2);
    }

    // 計算卡片價值（以魅力值為基準）
    getCardValue(card) {
        return this.getGeishaCharmPoints(card.geishaId);
    }

    // 結束回合並切換到下一位可行動玩家
    endTurn() {
        if (!this.gameState) {
            return;
        }

        const availablePlayerIndex = this.gameState.players.findIndex(player => player.actionTokens.some(token => !token.used));
        if (availablePlayerIndex === -1) {
            backendLogger.info(`🧮 房間 ${this.roomId} 所有玩家行動結束，進入結算階段`, {
                roomId: this.roomId
            });
            this.resolveRound();
            return;
        }

        let nextIndex = (this.gameState.currentPlayer + 1) % this.gameState.players.length;
        let attempts = 0;

        while (attempts < this.gameState.players.length) {
            const candidate = this.gameState.players[nextIndex];
            if (candidate && candidate.actionTokens.some(token => !token.used)) {
                this.gameState.currentPlayer = nextIndex;
                this.beginTurnForCurrentPlayer();
                return;
            }

            nextIndex = (nextIndex + 1) % this.gameState.players.length;
            attempts += 1;
        }

        backendLogger.info(`🧮 房間 ${this.roomId} 行動結束（未找到下一位玩家），進入結算`, {
            roomId: this.roomId
        });
        this.gameState.phase = 'resolution';
        this.broadcastGameState();
    }

    // 結算回合（翻開密約、計算好感、檢查勝利）
    resolveRound() {
        if (!this.gameState) {
            return;
        }

        this.gameState.phase = 'resolution';

        this.broadcast({
            type: 'ROUND_COMPLETE',
            payload: { round: this.gameState.round }
        });

        // 翻開密約卡並加入計分區
        this.gameState.players.forEach((player) => {
            if (player.secretCards.length > 0) {
                player.playedCards.push(...player.secretCards);
                player.secretCards = [];
            }
        });

        // 比較每位藝妓的卡牌數量，更新好感指示物
        this.gameState.geishas.forEach((geisha) => {
            const p1Count = this.countCardsForGeisha(this.gameState.players[0], geisha.id);
            const p2Count = this.countCardsForGeisha(this.gameState.players[1], geisha.id);

            if (p1Count > p2Count) {
                geisha.controlledBy = this.gameState.players[0].id;
            } else if (p2Count > p1Count) {
                geisha.controlledBy = this.gameState.players[1].id;
            }
            // 平手時保持原狀，不移動好感指示物
        });

        // 更新玩家分數資訊
        this.updatePlayerScores();

        // 廣播結算後狀態，讓前端顯示回合結算結果
        this.broadcastGameState();

        // 檢查勝利條件
        const winner = this.determineWinner();
        if (winner) {
            this.gameState.phase = 'ended';
            this.gameState.winner = winner;

            this.broadcast({
                type: 'GAME_ENDED',
                payload: { winner }
            });

            this.broadcastGameState();
            return;
        }

        // 準備下一輪（保留好感指示物）
        if (this.roundResolveTimer) {
            clearTimeout(this.roundResolveTimer);
        }

        this.roundResolveTimer = setTimeout(() => {
            this.roundResolveTimer = null;
            this.startNextRound();
        }, 2500);
    }

    // 驗證回合發牌與牌堆分配是否正確（用於偵錯與防呆）
    validateRoundSetup() {
        if (!this.gameState) {
            return;
        }

        const totalPlayers = this.gameState.players.length;
        const handSizes = this.gameState.players.map(player => player.hand.length);
        const totalHandCards = handSizes.reduce((sum, count) => sum + count, 0);
        const totalCardsInGame = totalHandCards + this.gameState.drawPile.length + (this.gameState.removedCard ? 1 : 0);

        // 規則：21 張牌中移除 1 張，剩 20 張進行發牌與牌堆
        if (totalCardsInGame !== 21) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 牌數異常`, {
                roomId: this.roomId,
                totalCardsInGame,
                expectedCards: 21
            });
        }

        if (totalPlayers === 2) {
            if (handSizes.some(size => size !== 6)) {
                backendLogger.warn(`⚠️ 房間 ${this.roomId} 手牌數量異常`, {
                    roomId: this.roomId,
                    handSizes: handSizes.join(',')
                });
            }

            if (this.gameState.drawPile.length !== 8) {
                backendLogger.warn(`⚠️ 房間 ${this.roomId} 牌堆數量異常`, {
                    roomId: this.roomId,
                    drawPileSize: this.gameState.drawPile.length
                });
            }
        }

        // 檢查是否有重複卡片 ID
        const cardIds = new Set();
        let hasDuplicate = false;

        const collect = (card) => {
            if (cardIds.has(card.id)) {
                hasDuplicate = true;
            }
            cardIds.add(card.id);
        };

        this.gameState.players.forEach(player => player.hand.forEach(collect));
        this.gameState.drawPile.forEach(collect);
        if (this.gameState.removedCard) {
            collect(this.gameState.removedCard);
        }

        if (hasDuplicate) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 發現重複卡片 ID，請檢查洗牌與發牌流程`, {
                roomId: this.roomId
            });
        }
    }

    // 統計玩家在特定藝妓上的卡片數量
    countCardsForGeisha(player, geishaId) {
        return player.playedCards.filter(card => card.geishaId === geishaId).length;
    }

    // 更新每位玩家的魅力值與好感數量
    updatePlayerScores() {
        if (!this.gameState) {
            return;
        }

        this.gameState.players.forEach((player) => {
            const controlled = this.gameState.geishas.filter(geisha => geisha.controlledBy === player.id);
            player.score.tokens = controlled.length;
            player.score.charm = controlled.reduce((total, geisha) => total + geisha.charmPoints, 0);
        });
    }

    // 判定勝利條件（魅力值優先於好感數）
    determineWinner() {
        if (!this.gameState) {
            return null;
        }

        const [playerA, playerB] = this.gameState.players;

        const aCharm = playerA.score.charm;
        const bCharm = playerB.score.charm;
        const aTokens = playerA.score.tokens;
        const bTokens = playerB.score.tokens;

        if (aCharm >= 11 || bCharm >= 11) {
            if (aCharm > bCharm) return playerA.id;
            if (bCharm > aCharm) return playerB.id;
            return null;
        }

        if (aTokens >= 4 || bTokens >= 4) {
            if (aTokens > bTokens) return playerA.id;
            if (bTokens > aTokens) return playerB.id;
        }

        return null;
    }

    // 取得下一輪的起始玩家順序
    getNextRoundOrder() {
        const currentPlayers = this.gameState?.players ?? [];
        if (currentPlayers.length < 2) {
            return [];
        }

        const currentStarter = this.lastRoundStarterId ?? currentPlayers[0].id;
        const nextStarter = currentPlayers.find(player => player.id !== currentStarter)?.id ?? currentPlayers[0].id;

        return [nextStarter, currentStarter];
    }

    // 開始下一輪（不再重新決定順序，而是輪流先手）
    startNextRound() {
        if (!this.gameState) {
            return;
        }

        const nextOrder = this.getNextRoundOrder();
        if (nextOrder.length < 2) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 無法開始下一輪（玩家不足）`, {
                roomId: this.roomId,
                playerCount: nextOrder.length
            });
            return;
        }

        // 保留好感指示物狀態，供下一輪延續
        this.baseGeishas = cloneGeishasForNextRound(this.gameState.geishas);
        this.lastRoundStarterId = nextOrder[0];

        this.prepareRoundState({
            orderedPlayerIds: nextOrder,
            roundNumber: this.gameState.round + 1,
            openOrderDecision: false
        });

        // 新一輪發牌動畫（依玩家視角遮蔽）
        if (this.dealSequence.length > 0) {
            this.players.forEach((player) => {
                this.sendToPlayer(player.playerId, {
                    type: 'DEAL_ANIMATION',
                    payload: {
                        sequence: this.buildDealSequenceForPlayer(player.playerId)
                    }
                });
            });
        }

        this.broadcastGameState();
        this.beginTurnForCurrentPlayer();
    }

    // 驗證玩家是否存在於房間內
    validatePlayerInRoom(playerId) {
        if (!this.players.some(player => player.playerId === playerId)) {
            this.sendError(playerId, '玩家不在房間內');
            return false;
        }
        return true;
    }

    // 驗證是否輪到該玩家行動
    validatePlayerTurn(playerId) {
        if (!this.gameState) {
            this.sendError(playerId, '遊戲尚未開始');
            return false;
        }

        const currentPlayer = this.gameState.players[this.gameState.currentPlayer];
        if (!currentPlayer || currentPlayer.id !== playerId) {
            this.sendError(playerId, '不是你的回合');
            return false;
        }
        return true;
    }

    // 驗證玩家行動指示物是否可用
    validateActionAvailable(player, actionType) {
        const token = player.actionTokens.find(item => item.type === actionType);
        if (!token || token.used) {
            this.sendError(player.id, '該行動已使用或不存在');
            return false;
        }
        return true;
    }

    // 驗證卡片是否屬於玩家
    validateCardOwnership(player, cardIds) {
        const uniqueIds = new Set(cardIds);
        if (uniqueIds.size !== cardIds.length) {
            this.sendError(player.id, '卡片選擇重複');
            return false;
        }

        const handIds = new Set(player.hand.map(card => card.id));
        const allOwned = cardIds.every(cardId => handIds.has(cardId));

        if (!allOwned) {
            this.sendError(player.id, '選擇的卡片不在你的手牌中');
            return false;
        }

        return true;
    }

    // 驗證互動狀態（避免同時進行多個互動）
    validatePendingInteraction(actionType, playerId) {
        const pending = this.gameState?.pendingInteraction;
        const isResolveAction = actionType.startsWith('RESOLVE_');

        if (pending && !isResolveAction) {
            this.sendError(playerId, '目前正在等待對手回應');
            return false;
        }

        if (!pending && isResolveAction) {
            this.sendError(playerId, '目前沒有等待處理的互動');
            return false;
        }

        return true;
    }

    // 處理玩家送出的行動（入口）
    handleAction(playerId, action) {
        if (!this.gameState) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 尚未建立遊戲狀態，無法處理行動`, {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '遊戲尚未準備完成');
            return;
        }

        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        const player = this.getPlayerState(playerId);
        if (!player) {
            backendLogger.warn(`⚠️ 找不到玩家 ${playerId}，忽略行動`, {
                roomId: this.roomId,
                playerId,
                actionType: action?.type
            });
            this.sendError(playerId, '玩家資料不存在');
            return;
        }

        if (!this.validatePendingInteraction(action.type, playerId)) {
            return;
        }

        if (this.gameState.phase !== 'playing' && !action.type.startsWith('RESOLVE_')) {
            this.sendError(playerId, '目前無法執行行動');
            return;
        }

        switch (action.type) {
            case 'PLAY_SECRET':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'secret')) {
                    return;
                }
                this.handlePlaySecret(player, action.payload?.cardId);
                break;
            case 'PLAY_TRADE_OFF':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'trade-off')) {
                    return;
                }
                this.handleTradeOff(player, action.payload?.cardIds);
                break;
            case 'INITIATE_GIFT':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'gift')) {
                    return;
                }
                this.handleInitiateGift(player, action.payload?.cardIds);
                break;
            case 'RESOLVE_GIFT':
                this.handleResolveGift(playerId, action.payload?.chosenCardId);
                break;
            case 'INITIATE_COMPETITION':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'competition')) {
                    return;
                }
                this.handleInitiateCompetition(player, action.payload?.groups);
                break;
            case 'RESOLVE_COMPETITION':
                this.handleResolveCompetition(playerId, action.payload?.chosenGroupIndex);
                break;
            default:
                backendLogger.warn('⚠️ 未實作的行動類型', {
                    roomId: this.roomId,
                    playerId,
                    actionType: action.type
                });
        }
    }

    // 執行密約行動（選 1 張卡蓋牌）
    handlePlaySecret(player, cardId) {
        if (!cardId) {
            backendLogger.warn('⚠️ PLAY_SECRET 缺少 cardId', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '請選擇 1 張卡片作為密約');
            return;
        }

        const cardIndex = player.hand.findIndex(card => card.id === cardId);
        if (cardIndex === -1) {
            backendLogger.warn(`⚠️ 玩家 ${player.id} 的手牌中找不到卡片`, {
                roomId: this.roomId,
                playerId: player.id,
                cardId
            });
            this.sendError(player.id, '卡片不在你的手牌中');
            return;
        }

        const [card] = player.hand.splice(cardIndex, 1);
        player.secretCards.push(card);

        this.markActionTokenUsed(player, 'secret');
        this.gameState.lastAction = { playerId: player.id, action: 'secret' };

        this.players.forEach((recipient) => {
            const shouldReveal = recipient.playerId === player.id;
            this.sendToPlayer(recipient.playerId, {
                type: 'ACTION_EXECUTED',
                payload: {
                    playerId: player.id,
                    action: 'secret',
                    cardIds: shouldReveal ? [card.id] : []
                }
            });
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行取捨行動（選 2 張卡丟棄）
    handleTradeOff(player, cardIds = []) {
        if (!Array.isArray(cardIds) || cardIds.length !== 2) {
            backendLogger.warn('⚠️ PLAY_TRADE_OFF 需要 2 張卡片', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '取捨必須選擇 2 張卡片');
            return;
        }

        if (!this.validateCardOwnership(player, cardIds)) {
            return;
        }

        const collected = [];

        cardIds.forEach(cardId => {
            const index = player.hand.findIndex(card => card.id === cardId);
            if (index !== -1) {
                collected.push(player.hand.splice(index, 1)[0]);
            }
        });

        if (collected.length !== 2) {
            backendLogger.warn('⚠️ PLAY_TRADE_OFF 無法找到所有指定卡片', {
                roomId: this.roomId,
                playerId: player.id
            });
            player.hand.push(...collected); // 還原
            this.sendError(player.id, '取捨卡片驗證失敗');
            return;
        }

        player.discardedCards.push(...collected);

        this.markActionTokenUsed(player, 'trade-off');
        this.gameState.lastAction = { playerId: player.id, action: 'trade-off' };

        this.players.forEach((recipient) => {
            const shouldReveal = recipient.playerId === player.id;
            this.sendToPlayer(recipient.playerId, {
                type: 'ACTION_EXECUTED',
                payload: {
                    playerId: player.id,
                    action: 'trade-off',
                    cardIds: shouldReveal ? cardIds : []
                }
            });
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行贈予行動（選 3 張卡給對手挑）
    handleInitiateGift(player, cardIds = []) {
        if (!Array.isArray(cardIds) || cardIds.length !== 3) {
            backendLogger.warn('⚠️ INITIATE_GIFT 需要 3 張卡片', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '贈予必須選擇 3 張卡片');
            return;
        }

        if (!this.validateCardOwnership(player, cardIds)) {
            return;
        }

        const opponentId = this.getOpponentId(player.id);
        if (!opponentId) {
            backendLogger.warn('⚠️ 找不到對手，無法執行贈予', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '目前沒有對手可進行贈予');
            return;
        }

        const offeredCards = [];
        cardIds.forEach(cardId => {
            const index = player.hand.findIndex(card => card.id === cardId);
            if (index !== -1) {
                offeredCards.push(player.hand.splice(index, 1)[0]);
            }
        });

        if (offeredCards.length !== 3) {
            backendLogger.warn('⚠️ INITIATE_GIFT 無法找到所有指定卡片', {
                roomId: this.roomId,
                playerId: player.id
            });
            player.hand.push(...offeredCards);
            this.sendError(player.id, '贈予卡片驗證失敗');
            return;
        }

        this.markActionTokenUsed(player, 'gift');
        this.gameState.pendingInteraction = {
            type: 'GIFT_SELECTION',
            initiatorId: player.id,
            targetPlayerId: opponentId,
            offeredCards
        };

        this.gameState.lastAction = { playerId: player.id, action: 'gift' };

        this.sendPendingInteractionState();

        this.broadcastGameState();

        // 若目標是 NPC，安排自動回應
        if (this.isNpcPlayerId(opponentId)) {
            this.scheduleNpcResponse();
        }
    }

    // 處理對手回應贈予（選 1 張卡）
    handleResolveGift(playerId, chosenCardId) {
        const pending = this.gameState?.pendingInteraction;

        if (!pending || pending.type !== 'GIFT_SELECTION') {
            backendLogger.warn('⚠️ 當前沒有贈予互動等待處理', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '目前沒有等待處理的贈予');
            return;
        }

        if (pending.targetPlayerId !== playerId) {
            backendLogger.warn('⚠️ 非目標玩家嘗試處理贈予', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '你不是贈予的目標玩家');
            return;
        }

        const chosenCard = pending.offeredCards.find(card => card.id === chosenCardId);
        if (!chosenCard) {
            backendLogger.warn('⚠️ RESOLVE_GIFT 選擇的卡片不存在', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '選擇的卡片不存在');
            return;
        }

        const opponent = this.getPlayerState(pending.initiatorId);
        const receiver = this.getPlayerState(playerId);

        if (!opponent || !receiver) {
            backendLogger.warn('⚠️ 找不到贈予雙方玩家', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '找不到贈予對象');
            return;
        }

        // 贈予結果：卡片直接加入各自的藝妓區（以 playedCards 代表）
        receiver.playedCards.push(chosenCard);

        const remaining = pending.offeredCards.filter(card => card.id !== chosenCardId);
        opponent.playedCards.push(...remaining);

        this.gameState.pendingInteraction = null;

        this.broadcast({
            type: 'INTERACTION_RESOLVED',
            payload: {
                interaction: 'GIFT_SELECTION',
                initiatorId: opponent.id,
                targetPlayerId: receiver.id,
                chosenCardId
            }
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行競爭行動（選 4 張卡分 2 組）
    handleInitiateCompetition(player, groups = []) {
        if (!Array.isArray(groups) || groups.length !== 2 || groups.some(group => group.length !== 2)) {
            backendLogger.warn('⚠️ INITIATE_COMPETITION 需要分成兩組且每組 2 張', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '競爭必須分成兩組，每組 2 張卡片');
            return;
        }

        const opponentId = this.getOpponentId(player.id);
        if (!opponentId) {
            backendLogger.warn('⚠️ 找不到對手，無法進行競爭', {
                roomId: this.roomId,
                playerId: player.id
            });
            this.sendError(player.id, '目前沒有對手可進行競爭');
            return;
        }

        const flattened = groups.flat();

        if (!this.validateCardOwnership(player, flattened)) {
            return;
        }
        const extractedCards = [];

        flattened.forEach(cardId => {
            const index = player.hand.findIndex(card => card.id === cardId);
            if (index !== -1) {
                extractedCards.push(player.hand.splice(index, 1)[0]);
            }
        });

        if (extractedCards.length !== 4) {
            backendLogger.warn('⚠️ INITIATE_COMPETITION 無法找到所有指定卡片', {
                roomId: this.roomId,
                playerId: player.id
            });
            player.hand.push(...extractedCards);
            this.sendError(player.id, '競爭卡片驗證失敗');
            return;
        }

        // 根據原分組恢復卡片資料
        const groupedCards = groups.map(group => group.map(cardId => extractedCards.find(card => card.id === cardId)).filter(Boolean));

        if (groupedCards.some(group => group.length !== 2)) {
            backendLogger.warn('⚠️ INITIATE_COMPETITION 組別卡片無法匹配', {
                roomId: this.roomId,
                playerId: player.id
            });
            player.hand.push(...extractedCards);
            this.sendError(player.id, '競爭分組驗證失敗');
            return;
        }

        this.markActionTokenUsed(player, 'competition');
        this.gameState.pendingInteraction = {
            type: 'COMPETITION_SELECTION',
            initiatorId: player.id,
            targetPlayerId: opponentId,
            groups: groupedCards
        };

        this.gameState.lastAction = { playerId: player.id, action: 'competition' };

        this.sendPendingInteractionState();

        this.broadcastGameState();

        // 若目標是 NPC，安排自動回應
        if (this.isNpcPlayerId(opponentId)) {
            this.scheduleNpcResponse();
        }
    }

    // 處理對手回應競爭（選 1 組）
    handleResolveCompetition(playerId, chosenGroupIndex) {
        const pending = this.gameState?.pendingInteraction;

        if (!pending || pending.type !== 'COMPETITION_SELECTION') {
            backendLogger.warn('⚠️ 當前沒有競爭互動等待處理', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '目前沒有等待處理的競爭');
            return;
        }

        if (pending.targetPlayerId !== playerId) {
            backendLogger.warn('⚠️ 非目標玩家嘗試處理競爭', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '你不是競爭的目標玩家');
            return;
        }

        const selectedGroup = pending.groups[chosenGroupIndex];
        if (!selectedGroup) {
            backendLogger.warn('⚠️ RESOLVE_COMPETITION 選擇的組別不存在', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '選擇的組別不存在');
            return;
        }

        const opponentGroupIndex = chosenGroupIndex === 0 ? 1 : 0;
        const opponentGroup = pending.groups[opponentGroupIndex];

        const initiator = this.getPlayerState(pending.initiatorId);
        const receiver = this.getPlayerState(playerId);

        if (!initiator || !receiver) {
            backendLogger.warn('⚠️ 找不到競爭雙方玩家', {
                roomId: this.roomId,
                playerId
            });
            this.sendError(playerId, '找不到競爭對象');
            return;
        }

        // 競爭結果：卡片直接加入各自的藝妓區（以 playedCards 代表）
        receiver.playedCards.push(...selectedGroup);
        initiator.playedCards.push(...opponentGroup);

        this.gameState.pendingInteraction = null;

        this.broadcast({
            type: 'INTERACTION_RESOLVED',
            payload: {
                interaction: 'COMPETITION_SELECTION',
                initiatorId: initiator.id,
                targetPlayerId: receiver.id,
                chosenGroupIndex
            }
        });

        this.broadcastGameState();
        this.endTurn();
    }
}

// 由 Redis 快照還原房間（只重建必要狀態）
const restoreRoomFromSnapshot = (snapshot) => {
    if (!snapshot?.roomId) {
        return { room: null, errorMessage: LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE };
    }

    let snapshotGeishaSet = DEFAULT_GEISHA_SET;
    let resolvedBoard = null;
    try {
        snapshotGeishaSet = resolveRestorableGeishaSet(snapshot);
        resolvedBoard = resolveRestorableBoardForSet(snapshot, snapshotGeishaSet);
    } catch (_error) {
        return { room: null, errorMessage: LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE };
    }

    const room = new GameRoom(snapshot.roomId);
    room.hostId = snapshot.hostId ?? null;
    room.geishaSet = snapshotGeishaSet;
    room.npcId = snapshot.npcId ?? null;
    room.npcDifficulty = snapshot.npcDifficulty ?? null;
    room.createdAt = snapshot.createdAt ?? Date.now();
    room.baseGeishas = resolvedBoard;
    room.gameState = snapshot.gameState ?? null;

    if (room.npcId) {
        const npcSocket = {
            readyState: 1,
            send: () => { }
        };
        room.players.push({ playerId: room.npcId, ws: npcSocket, isNpc: true });
    }

    if (room.gameState) {
        room.gameState.geishaSet = snapshotGeishaSet;
    }

    return { room, errorMessage: null };
};

// WebSocket 連線入口（處理玩家進出與訊息）
wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    backendLogger.info('🔌 客戶端已連接', {
        origin: typeof origin === 'string' ? origin : 'unknown'
    });

    let currentPlayerId = null;
    let currentRoomId = null;

    // 監聽客戶端訊息
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
            backendLogger.diagnostic('🐞 [Server] 收到訊息摘要', {
                origin: typeof origin === 'string' ? origin : 'unknown',
                ...summarizeWebSocketMessage(message)
            });

            switch (message.type) {
                case 'JOIN_ROOM':
                    await handleJoinRoom(ws, message.payload);
                    break;
                case 'CREATE_ROOM':
                    await handleCreateRoom(ws, message.payload);
                    break;
                case 'CONFIRM_ORDER':
                    handleConfirmOrder(ws, message.payload);
                    break;
                case 'GAME_ACTION':
                    handleGameAction(ws, message.payload);
                    break;
                case 'READY_CONFIRM':
                    handleReadyConfirm(ws, message.payload);
                    break;
                case 'REMATCH_REQUEST':
                    handleRematchRequest(ws, message.payload);
                    break;
                case 'LEAVE_ROOM':
                    handleLeaveRoom(ws);
                    break;
                default:
                    backendLogger.warn('⚠️ 未知訊息類型', {
                        type: typeof message?.type === 'string' ? message.type : 'unknown',
                        origin: typeof origin === 'string' ? origin : 'unknown'
                    });
            }
        } catch (error) {
            backendLogger.error('❌ 訊息解析錯誤', {
                origin: typeof origin === 'string' ? origin : 'unknown',
                error: error instanceof Error ? error.message : 'unknown'
            });
        }
    });

    // 連線關閉時清理狀態
    ws.on('close', () => {
        if (currentRoomId && currentPlayerId) {
            handleLeaveRoom(ws);
        }
        backendLogger.info('🔌 客戶端已斷線', {
            origin: typeof origin === 'string' ? origin : 'unknown',
            roomId: currentRoomId ?? undefined,
            playerId: currentPlayerId ?? undefined
        });
    });

    // 建立房間流程（含基本參數驗證）
    async function handleCreateRoom(ws, payload) {
        if (!payload?.playerId) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '缺少 playerId' }
            }));
            return;
        }

        const mode = payload.mode === 'npc' ? 'npc' : 'online';
        const aiDifficulty = normalizeNpcDifficulty(payload.aiDifficulty ?? 'easy');
        const requestedGeishaSet = normalizeGeishaSet(payload.geishaSet);
        if (!isSupportedGeishaSet(requestedGeishaSet)) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: LEGACY_GEISHA_SET_ERROR_MESSAGE }
            }));
            return;
        }

        const roomId = generateRoomId();
        const room = new GameRoom(roomId);
        gameRooms.set(roomId, room);

        currentPlayerId = payload.playerId;
        currentRoomId = roomId;
        room.hostId = currentPlayerId;
        room.geishaSet = requestedGeishaSet;
        if (!room.regenerateBaseGeishas()) {
            gameRooms.delete(roomId);
            currentRoomId = null;
            currentPlayerId = null;
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: GEISHA_SET_CONFIG_ERROR_MESSAGE }
            }));
            return;
        }

        room.addPlayer(currentPlayerId, ws, normalizePlayerMeta(currentPlayerId, payload));

        if (mode === 'npc') {
            room.addNpcPlayer(aiDifficulty);
        }

        backendLogger.info(`🏠 房間 ${roomId} 已建立`, {
            roomId,
            playerId: currentPlayerId,
            mode,
            geishaSet: requestedGeishaSet,
            origin: typeof origin === 'string' ? origin : 'unknown'
        });

        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { roomId, playerId: currentPlayerId }
        }));

        const initialGameState = createWaitingGameState(
            roomId,
            room.players.map(p => p.playerId),
            room.baseGeishas,
            room.geishaSet,
            room.getPlayerMetaMap()
        );
        initialGameState.hostId = room.hostId;
        room.gameState = initialGameState;

        room.broadcastGameState();

        room.persistRoomSnapshot();

        if (room.players.length === room.maxPlayers) {
            backendLogger.info(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`, {
                roomId
            });
            setTimeout(() => {
                room.startOrderDecision();
            }, 800);
        }
    }

    // 加入房間流程（含房間與參數驗證）
    async function handleJoinRoom(ws, payload) {
        if (!payload?.roomId || !payload?.playerId) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '缺少 roomId 或 playerId' }
            }));
            return;
        }

        const { roomId, playerId } = payload;
        let room = gameRooms.get(roomId);

        if (!room) {
            const snapshot = await loadRoomSnapshot(roomId);
            if (snapshot) {
                const restoreResult = restoreRoomFromSnapshot(snapshot);
                room = restoreResult.room;
                if (room) {
                    gameRooms.set(roomId, room);
                } else if (restoreResult.errorMessage) {
                    ws.send(JSON.stringify({
                        type: 'ERROR',
                        payload: { message: restoreResult.errorMessage }
                    }));
                    return;
                }
            }
        }

        if (!room) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '房間不存在' }
            }));
            return;
        }
        if (!room.ensureBaseGeishas()) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: GEISHA_SET_CONFIG_ERROR_MESSAGE }
            }));
            return;
        }
        const result = room.addPlayer(playerId, ws, normalizePlayerMeta(playerId, payload));

        if (result === 'full') {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '房間已滿' }
            }));
            return;
        }

        currentPlayerId = playerId;
        currentRoomId = roomId;

        if (result === 'existing') {
            backendLogger.info(`♻️ 玩家 ${playerId} 已在房間 ${roomId}，同步當前狀態`, {
                roomId,
                playerId
            });
            if (room.gameState) {
                const payloadState = room.buildClientGameState(playerId);
                ws.send(JSON.stringify({
                    type: 'GAME_STATE_UPDATED',
                    payload: payloadState
                }));
            }
            return;
        }

        backendLogger.info(`👤 玩家 ${playerId} 加入房間 ${roomId}`, {
            roomId,
            playerId,
            geishaSet: room.geishaSet,
            origin: typeof origin === 'string' ? origin : 'unknown'
        });

        ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            payload: { playerId, roomId }
        }));

        const updatedGameState = createWaitingGameState(
            roomId,
            room.players.map(p => p.playerId),
            room.baseGeishas,
            room.geishaSet,
            room.getPlayerMetaMap()
        );
        updatedGameState.hostId = room.hostId;
        room.gameState = updatedGameState;

        room.broadcastGameState();

        room.persistRoomSnapshot();

        if (room.players.length === room.maxPlayers) {
            backendLogger.info(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`, {
                roomId
            });
            setTimeout(() => {
                room.startOrderDecision();
            }, 1000);
        }
    }

    // 玩家確認順序（等待雙方確認後開始遊戲）
    function handleConfirmOrder(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (!room || !currentPlayerId) {
            return;
        }
        room.confirmOrder(currentPlayerId);
    }

    // 處理遊戲行動（含基本驗證）
    function handleGameAction(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (!room || !currentPlayerId) {
            return;
        }

        if (!payload || !payload.action || !payload.action.type) {
            backendLogger.warn('⚠️ GAME_ACTION 缺少 action 內容', {
                roomId: currentRoomId ?? undefined,
                playerId: currentPlayerId ?? undefined
            });
            room.sendError(currentPlayerId, '缺少行動內容');
            return;
        }

        room.handleAction(currentPlayerId, payload.action);
    }

    // 玩家準備確認
    function handleReadyConfirm(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (!room || !currentPlayerId) {
            return;
        }

        room.confirmReady(currentPlayerId);
    }

    // 再來一場請求
    function handleRematchRequest(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (!room || !currentPlayerId) {
            return;
        }

        room.requestRematch(currentPlayerId);
    }

    // 玩家離開房間（斷線或主動退出）
    function handleLeaveRoom(ws) {
        if (currentRoomId && currentPlayerId) {
            const room = gameRooms.get(currentRoomId);
            if (room) {
                room.removePlayer(currentPlayerId);
                room.broadcast({
                    type: 'PLAYER_LEFT',
                    payload: { playerId: currentPlayerId }
                });

                const hasOnlyNpc = room.players.length === 1 && room.npcId && room.players[0].playerId === room.npcId;
                if (room.players.length === 0 || hasOnlyNpc) {
                    gameRooms.delete(currentRoomId);
                    void deleteRoomSnapshot(currentRoomId);
                    backendLogger.info(`🗑️ 房間 ${currentRoomId} 已刪除`, {
                        roomId: currentRoomId
                    });
                }
            }
        }
    }
});

// 建立遮蔽卡片（避免洩漏對手手牌資訊）
function createMaskedCard(prefix, index) {
    return {
        id: `hidden-${prefix}-${index}`,
        geishaId: 0,
        type: 'hidden'
    };
}

// 依指定長度建立遮蔽卡片陣列
function createMaskedCards(count, prefix) {
    return Array.from({ length: count }, (_, index) => createMaskedCard(prefix, index));
}

// 產生 6 碼房間代碼
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
    backendLogger.info('🚀 WebSocket 伺服器已啟動', {
        port: Number(PORT),
        environment: process.env.NODE_ENV ?? 'development'
    });
});
