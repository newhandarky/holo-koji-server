// server/index.js - 添加隨機順序決定功能
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { createRandomizedGeishas, createBaseGeishas, buildDeckForGeishas } from './utils/gameUtils.js';

const app = express();
const server = createServer(app);

// CORS 設定
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

const gameRooms = new Map();
const wss = new WebSocketServer({ server });

class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = [];
        this.gameState = null;
        this.maxPlayers = 2;
        this.hostId = null;
        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };
        this.baseGeishas = null;
        this.dealSequence = [];
        this.lastRoundStarterId = null;
    }

    // 將訊息傳送給指定玩家（避免廣播時洩漏資訊）
    sendToPlayer(playerId, message) {
        const target = this.players.find(player => player.playerId === playerId);
        if (!target) {
            console.warn(`⚠️ 找不到玩家 ${playerId}，無法傳送訊息`);
            return;
        }

        if (target.ws.readyState !== 1) {
            console.warn(`⚠️ 玩家 ${playerId} 連線狀態異常: ${target.ws.readyState}`);
            return;
        }

        try {
            target.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(`❌ 傳送訊息給玩家 ${playerId} 失敗:`, error);
        }
    }

    // 傳送錯誤訊息給指定玩家（統一錯誤回傳格式）
    sendError(playerId, message) {
        this.sendToPlayer(playerId, {
            type: 'ERROR',
            payload: { message }
        });
    }

    // 將遊戲狀態整理成玩家可見版本（隱藏對手手牌與密約資訊）
    buildClientGameState(viewerId) {
        if (!this.gameState) {
            return null;
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
            removedCard: null
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
    addPlayer(playerId, ws) {
        // 基本檢查：避免空白 playerId
        if (!playerId) {
            console.warn('⚠️ 嘗試加入房間但 playerId 為空');
            return 'invalid';
        }

        const existingPlayer = this.players.find(player => player.playerId === playerId);

        if (existingPlayer) {
            existingPlayer.ws = ws;
            console.log(`♻️ 玩家 ${playerId} 重新連線房間 ${this.roomId}`);
            return 'existing';
        }

        if (this.players.length >= this.maxPlayers) {
            return 'full';
        }

        this.players.push({ playerId, ws });
        console.log(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}，當前玩家數：${this.players.length}`);
        return 'added';
    }

    // 從房間移除玩家
    removePlayer(playerId) {
        this.players = this.players.filter(p => p.playerId !== playerId);
        console.log(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}，當前玩家數：${this.players.length}`);
    }

    // 廣播訊息給房間內所有玩家（非狀態同步使用）
    broadcast(message, excludePlayerId = null) {
        console.log(`📢 房間 ${this.roomId} 廣播訊息給 ${this.players.length} 個玩家:`, message.type);

        let successCount = 0;
        this.players.forEach((player, index) => {
            if (player.playerId !== excludePlayerId) {
                if (player.ws.readyState === 1) {
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

    // 檢查房間是否已滿員
    isFull() {
        return this.players.length === this.maxPlayers;
    }

    // 準備新回合的初始狀態（洗牌、移除卡、發牌）
    prepareRoundState({ orderedPlayerIds = null, roundNumber = null, openOrderDecision = true } = {}) {
        const playerIds = orderedPlayerIds ?? this.players.map(p => p.playerId);

        if (playerIds.length < 2) {
            console.warn(`⚠️ 房間 ${this.roomId} 嘗試準備回合，但玩家不足`);
            return;
        }

        if (!this.baseGeishas) {
            this.baseGeishas = createRandomizedGeishas();
        }

        const geishasClone = cloneGeishas(this.baseGeishas);
        const { deck, removedCard } = buildDeckForGeishas(geishasClone);

        const dealingDeck = [...deck];
        const dealSequence = [];
        const playersState = playerIds.map((id) => createPlayer(id));

        for (let round = 0; round < 6; round += 1) {
            playerIds.forEach((playerId, index) => {
                const dealtCard = dealingDeck.shift();
                if (!dealtCard) {
                    console.error(`❌ 房間 ${this.roomId} 發牌時牌庫不足`);
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

        console.log(`🃏 房間 ${this.roomId} 已準備新回合，發牌序列長度: ${this.dealSequence.length}`);

        // 回合初始化檢查（避免發牌數量或重複卡異常）
        this.validateRoundSetup();
    }

    // 開始隨機決定順序
    startOrderDecision() {
        console.log(`🎲 房間 ${this.roomId} 開始隨機決定玩家順序`);

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

        console.log(`🎲 房間 ${this.roomId} 順序決定結果:`, this.orderDecisionState.result);

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
    }

    // 處理玩家確認
    confirmOrder(playerId) {
        // 確認玩家在房間內
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        if (!this.orderDecisionState.result) {
            console.warn(`⚠️ 玩家 ${playerId} 嘗試確認，但順序尚未決定`);
            this.sendError(playerId, '順序尚未決定，請稍後再確認');
            return;
        }

        this.orderDecisionState.confirmations.add(playerId);
        console.log(`✅ 玩家 ${playerId} 已確認順序，目前確認數: ${this.orderDecisionState.confirmations.size}/2`);

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
                this.startGameWithOrder();
            }, 1000);
        }
    }

    // 根據決定的順序開始遊戲
    startGameWithOrder() {
        const { order } = this.orderDecisionState.result;
        if (!this.baseGeishas) {
            this.baseGeishas = createRandomizedGeishas();
        }
        const { gameState } = createGameStateWithOrder(this.roomId, order, this.baseGeishas, this.gameState);
        this.gameState = gameState;
        this.lastRoundStarterId = order[0];

        console.log(`🚀 遊戲開始，房間 ${this.roomId}，順序：`, order);

        this.broadcastGameStateEvent('GAME_STARTED');

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
            console.warn(`⚠️ 房間 ${this.roomId} 找不到當前玩家資料`);
            return;
        }

        if (currentPlayer.actionTokens.every(token => token.used)) {
            console.log(`🔄 玩家 ${currentPlayer.id} 已無可用行動，跳到下一位`);
            this.endTurn();
            return;
        }

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
    }

    // 結束回合並切換到下一位可行動玩家
    endTurn() {
        if (!this.gameState) {
            return;
        }

        const availablePlayerIndex = this.gameState.players.findIndex(player => player.actionTokens.some(token => !token.used));
        if (availablePlayerIndex === -1) {
            console.log(`🧮 房間 ${this.roomId} 所有玩家行動結束，進入結算階段`);
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

        console.log(`🧮 房間 ${this.roomId} 行動結束（未找到下一位玩家），進入結算`);
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
        this.startNextRound();
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
            console.warn(`⚠️ 房間 ${this.roomId} 牌數異常，總數=${totalCardsInGame}（預期 21）`);
        }

        if (totalPlayers === 2) {
            if (handSizes.some(size => size !== 6)) {
                console.warn(`⚠️ 房間 ${this.roomId} 手牌數量異常: ${handSizes.join(', ')}`);
            }

            if (this.gameState.drawPile.length !== 8) {
                console.warn(`⚠️ 房間 ${this.roomId} 牌堆數量異常: ${this.gameState.drawPile.length}`);
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
            console.warn(`⚠️ 房間 ${this.roomId} 發現重複卡片 ID，請檢查洗牌與發牌流程`);
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
            console.warn(`⚠️ 房間 ${this.roomId} 無法開始下一輪（玩家不足）`);
            return;
        }

        // 保留好感指示物狀態，供下一輪延續
        this.baseGeishas = cloneGeishas(this.gameState.geishas);
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
            console.warn(`⚠️ 房間 ${this.roomId} 尚未建立遊戲狀態，無法處理行動`);
            this.sendError(playerId, '遊戲尚未準備完成');
            return;
        }

        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        const player = this.getPlayerState(playerId);
        if (!player) {
            console.warn(`⚠️ 找不到玩家 ${playerId}，忽略行動 ${action?.type}`);
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
                console.warn(`⚠️ 未實作的行動類型: ${action.type}`);
        }
    }

    // 執行密約行動（選 1 張卡蓋牌）
    handlePlaySecret(player, cardId) {
        if (!cardId) {
            console.warn('⚠️ PLAY_SECRET 缺少 cardId');
            this.sendError(player.id, '請選擇 1 張卡片作為密約');
            return;
        }

        const cardIndex = player.hand.findIndex(card => card.id === cardId);
        if (cardIndex === -1) {
            console.warn(`⚠️ 玩家 ${player.id} 的手牌中找不到卡片 ${cardId}`);
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
            console.warn('⚠️ PLAY_TRADE_OFF 需要 2 張卡片');
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
            console.warn('⚠️ PLAY_TRADE_OFF 無法找到所有指定卡片');
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
            console.warn('⚠️ INITIATE_GIFT 需要 3 張卡片');
            this.sendError(player.id, '贈予必須選擇 3 張卡片');
            return;
        }

        if (!this.validateCardOwnership(player, cardIds)) {
            return;
        }

        const opponentId = this.getOpponentId(player.id);
        if (!opponentId) {
            console.warn('⚠️ 找不到對手，無法執行贈予');
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
            console.warn('⚠️ INITIATE_GIFT 無法找到所有指定卡片');
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

        this.broadcast({
            type: 'PENDING_INTERACTION',
            payload: this.gameState.pendingInteraction
        });

        this.broadcastGameState();
    }

    // 處理對手回應贈予（選 1 張卡）
    handleResolveGift(playerId, chosenCardId) {
        const pending = this.gameState?.pendingInteraction;

        if (!pending || pending.type !== 'GIFT_SELECTION') {
            console.warn('⚠️ 當前沒有贈予互動等待處理');
            this.sendError(playerId, '目前沒有等待處理的贈予');
            return;
        }

        if (pending.targetPlayerId !== playerId) {
            console.warn('⚠️ 非目標玩家嘗試處理贈予');
            this.sendError(playerId, '你不是贈予的目標玩家');
            return;
        }

        const chosenCard = pending.offeredCards.find(card => card.id === chosenCardId);
        if (!chosenCard) {
            console.warn('⚠️ RESOLVE_GIFT 選擇的卡片不存在');
            this.sendError(playerId, '選擇的卡片不存在');
            return;
        }

        const opponent = this.getPlayerState(pending.initiatorId);
        const receiver = this.getPlayerState(playerId);

        if (!opponent || !receiver) {
            console.warn('⚠️ 找不到贈予雙方玩家');
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
            console.warn('⚠️ INITIATE_COMPETITION 需要分成兩組且每組 2 張');
            this.sendError(player.id, '競爭必須分成兩組，每組 2 張卡片');
            return;
        }

        const opponentId = this.getOpponentId(player.id);
        if (!opponentId) {
            console.warn('⚠️ 找不到對手，無法進行競爭');
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
            console.warn('⚠️ INITIATE_COMPETITION 無法找到所有指定卡片');
            player.hand.push(...extractedCards);
            this.sendError(player.id, '競爭卡片驗證失敗');
            return;
        }

        // 根據原分組恢復卡片資料
        const groupedCards = groups.map(group => group.map(cardId => extractedCards.find(card => card.id === cardId)).filter(Boolean));

        if (groupedCards.some(group => group.length !== 2)) {
            console.warn('⚠️ INITIATE_COMPETITION 組別卡片無法匹配');
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

        this.broadcast({
            type: 'PENDING_INTERACTION',
            payload: this.gameState.pendingInteraction
        });

        this.broadcastGameState();
    }

    // 處理對手回應競爭（選 1 組）
    handleResolveCompetition(playerId, chosenGroupIndex) {
        const pending = this.gameState?.pendingInteraction;

        if (!pending || pending.type !== 'COMPETITION_SELECTION') {
            console.warn('⚠️ 當前沒有競爭互動等待處理');
            this.sendError(playerId, '目前沒有等待處理的競爭');
            return;
        }

        if (pending.targetPlayerId !== playerId) {
            console.warn('⚠️ 非目標玩家嘗試處理競爭');
            this.sendError(playerId, '你不是競爭的目標玩家');
            return;
        }

        const selectedGroup = pending.groups[chosenGroupIndex];
        if (!selectedGroup) {
            console.warn('⚠️ RESOLVE_COMPETITION 選擇的組別不存在');
            this.sendError(playerId, '選擇的組別不存在');
            return;
        }

        const opponentGroupIndex = chosenGroupIndex === 0 ? 1 : 0;
        const opponentGroup = pending.groups[opponentGroupIndex];

        const initiator = this.getPlayerState(pending.initiatorId);
        const receiver = this.getPlayerState(playerId);

        if (!initiator || !receiver) {
            console.warn('⚠️ 找不到競爭雙方玩家');
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

// WebSocket 連線入口（處理玩家進出與訊息）
wss.on('connection', (ws, req) => {
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
                case 'CONFIRM_ORDER':
                    handleConfirmOrder(ws, message.payload);
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

    // 建立房間流程（含基本參數驗證）
    function handleCreateRoom(ws, payload) {
        if (!payload?.playerId) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '缺少 playerId' }
            }));
            return;
        }

        const roomId = generateRoomId();
        const room = new GameRoom(roomId);
        gameRooms.set(roomId, room);

        currentPlayerId = payload.playerId;
        currentRoomId = roomId;
        room.hostId = currentPlayerId;

        room.baseGeishas = createRandomizedGeishas();

        room.addPlayer(currentPlayerId, ws);

        console.log(`🏠 房間 ${roomId} 已建立，創建者：${currentPlayerId}，來源：${origin}`);

        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { roomId, playerId: currentPlayerId }
        }));

        const initialGameState = createWaitingGameState(roomId, [currentPlayerId], room.baseGeishas);
        initialGameState.hostId = room.hostId;
        room.gameState = initialGameState;

        room.broadcastGameState();
    }

    // 加入房間流程（含房間與參數驗證）
    function handleJoinRoom(ws, payload) {
        if (!payload?.roomId || !payload?.playerId) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '缺少 roomId 或 playerId' }
            }));
            return;
        }

        const { roomId, playerId } = payload;
        const room = gameRooms.get(roomId);

        if (!room) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '房間不存在' }
            }));
            return;
        }
        if (!room.baseGeishas) {
            room.baseGeishas = createRandomizedGeishas();
        }
        const result = room.addPlayer(playerId, ws);

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
            console.log(`♻️ 玩家 ${playerId} 已在房間 ${roomId}，同步當前狀態`);
            if (room.gameState) {
                const payloadState = room.buildClientGameState(playerId);
                ws.send(JSON.stringify({
                    type: 'GAME_STATE_UPDATED',
                    payload: payloadState
                }));
            }
            return;
        }

        console.log(`👤 玩家 ${playerId} 加入房間 ${roomId}，來源：${origin}`);

        ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            payload: { playerId, roomId }
        }));

        const updatedGameState = createWaitingGameState(roomId, room.players.map(p => p.playerId), room.baseGeishas);
        updatedGameState.hostId = room.hostId;
        room.gameState = updatedGameState;

        room.broadcastGameState();

        if (room.players.length === room.maxPlayers) {
            console.log(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`);
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
            console.warn('⚠️ GAME_ACTION 缺少 action 內容');
            room.sendError(currentPlayerId, '缺少行動內容');
            return;
        }

        room.handleAction(currentPlayerId, payload.action);
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

                if (room.players.length === 0) {
                    gameRooms.delete(currentRoomId);
                    console.log(`🗑️ 房間 ${currentRoomId} 已刪除`);
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

// 複製藝妓資料（避免意外修改原始物件）
function cloneGeishas(geishas) {
    return geishas.map((geisha) => ({ ...geisha }));
}

// 建立等待中的遊戲狀態（玩家尚未滿或尚未開始）
function createWaitingGameState(gameId, playerIds, geishas) {
    return {
        gameId,
        hostId: null,
        players: playerIds.map(id => createPlayer(id)),
        geishas: cloneGeishas(geishas ?? createBaseGeishas()),
        currentPlayer: 0,
        phase: 'waiting',
        round: 1,
        winner: null,
        orderDecision: {
            isOpen: false,
            phase: 'deciding',
            players: playerIds,
            result: undefined,
            confirmations: [],
            waitingFor: playerIds,
            currentPlayer: playerIds[0] ?? ''
        },
        drawPile: [],
        discardPile: [],
        removedCard: null,
        pendingInteraction: null,
        lastAction: undefined
    };
}

// 建立排序後的遊戲狀態（保留上一輪資料）
function createGameStateWithOrder(gameId, orderedPlayerIds, geishas, existingState = null) {
    const baseGeishas = geishas ?? createBaseGeishas();
    const previousState = existingState ?? {};

    const players = orderedPlayerIds.map(playerId => {
        const existingPlayer = previousState.players?.find(player => player.id === playerId);
        if (existingPlayer) {
            return {
                ...existingPlayer,
                actionTokens: existingPlayer.actionTokens.map(token => ({ ...token, used: token.used ?? false }))
            };
        }

        return createPlayer(playerId);
    });

    return {
        gameState: {
            gameId,
            hostId: previousState.hostId ?? null,
            players,
            geishas: cloneGeishas(baseGeishas),
            currentPlayer: 0,
            phase: 'playing',
            round: previousState.round ?? 1,
            winner: null,
            orderDecision: {
                isOpen: false,
                phase: 'result',
                players: orderedPlayerIds,
                result: {
                    firstPlayer: orderedPlayerIds[0],
                    secondPlayer: orderedPlayerIds[1],
                    order: orderedPlayerIds
                },
                confirmations: [...orderedPlayerIds],
                waitingFor: []
            },
            drawPile: previousState.drawPile ?? [],
            discardPile: previousState.discardPile ?? [],
            removedCard: previousState.removedCard ?? null,
            pendingInteraction: null,
            lastAction: undefined
        }
    };
}

// 建立玩家初始資料結構
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
        ],
        score: {
            charm: 0,
            tokens: 0
        }
    };
}

// 產生 6 碼房間代碼
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

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
