// server/index.js - 添加隨機順序決定功能
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

/**
 * @typedef {import('game-shared-types').GameState} GameState
 * @typedef {import('game-shared-types').Player} Player
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 * @typedef {import('game-shared-types').PendingInteraction} PendingInteraction
 * @typedef {import('game-shared-types').GameAction} GameAction
 */

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

const ACTION_SEQUENCE = ['secret', 'trade-off', 'gift', 'competition'];
const ACTION_CARD_REQUIREMENT = {
    secret: 1,
    'trade-off': 2,
    gift: 3,
    competition: 4
};

const GEISHAS_BASE = [
    { id: 1, name: '白上フブキ', charmPoints: 2 },
    { id: 2, name: '百鬼あやめ', charmPoints: 2 },
    { id: 3, name: '大神ミオ', charmPoints: 2 },
    { id: 4, name: 'さくらみこ', charmPoints: 3 },
    { id: 5, name: '風真いろは', charmPoints: 3 },
    { id: 6, name: '儒烏風亭らでん', charmPoints: 4 },
    { id: 7, name: '一伊那尓栖', charmPoints: 5 }
];

const shuffleArray = (array) => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

const buildDeck = () => {
    const deck = [];
    GEISHAS_BASE.forEach((geisha) => {
        for (let copy = 0; copy < 3; copy++) {
            deck.push({
                id: `${geisha.id}-${copy}-${Math.random().toString(36).slice(2, 8)}`,
                geishaId: geisha.id,
                type: `item-${geisha.id}`
            });
        }
    });
    const shuffled = shuffleArray(deck);
    const removedCard = shuffled.pop();
    return {
        deck: shuffled,
        removedCard
    };
};

const cloneGeishas = () => GEISHAS_BASE.map((geisha) => ({ ...geisha, controlledBy: null }));

const createPlayerState = (playerId) => ({
    id: playerId,
    name: playerId,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: ACTION_SEQUENCE.map((type) => ({ type, used: false })),
    score: {
        charm: 0,
        tokens: 0
    }
});

class GameRoom {
    constructor(roomId) {
        this.roomId = roomId;
        this.players = [];
        this.gameState = null;
        this.maxPlayers = 2;
        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };
        this.drawPile = [];
        this.discardPile = [];
        this.removedCard = null;
        this.pendingInteraction = null;
        this.currentOrder = [];
        this.round = 1;
        this.startingPlayerIndex = 0;
    }

    addPlayer(playerId, ws) {
        const existingPlayer = this.players.find(player => player.playerId === playerId); // 讓重連玩家沿用原本的 socket

        if (existingPlayer) {
            existingPlayer.ws = ws;
            console.log(`♻️ 玩家 ${playerId} 重新連線房間 ${this.roomId}`);
            return true;
        }

        if (this.players.length < this.maxPlayers) {
            this.players.push({ playerId, ws });
            console.log(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}，當前玩家數：${this.players.length}`);
            return true;
        }

        console.warn(`⚠️ 玩家 ${playerId} 嘗試加入已滿的房間 ${this.roomId}`);
        return false;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.playerId !== playerId);
        console.log(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}，當前玩家數：${this.players.length}`);
    }

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

    isFull() {
        return this.players.length === this.maxPlayers;
    }

    getPlayerState(playerId) {
        return this.gameState?.players.find((player) => player.id === playerId) || null;
    }

    getOpponentId(playerId) {
        if (!this.gameState) {
            return null;
        }
        const opponent = this.gameState.players.find((player) => player.id !== playerId);
        return opponent ? opponent.id : null;
    }

    syncDerivedState() {
        if (!this.gameState) {
            return;
        }
        this.gameState.drawPile = [...this.drawPile];
        this.gameState.discardPile = [...this.discardPile];
        this.gameState.pendingInteraction = this.pendingInteraction;
        this.gameState.removedCard = undefined;
    }

    broadcastState(reason = 'GAME_STATE_UPDATED') {
        if (!this.gameState) {
            return;
        }
        this.syncDerivedState();
        this.broadcast({
            type: reason,
            payload: this.gameState
        });
    }

    prepareNewRound(startingPlayerId) {
        const { deck, removedCard } = buildDeck();
        this.drawPile = deck;
        this.removedCard = removedCard;
        this.discardPile = [];
        this.pendingInteraction = null;

        const orderedPlayers = this.currentOrder.length > 0 ? this.currentOrder : this.players.map((p) => p.playerId);
        const existingPlayers = this.gameState?.players || [];
        const refreshedPlayers = orderedPlayers.map((playerId) => {
            const existing = existingPlayers.find((player) => player.id === playerId);
            const baseState = existing ? { ...existing } : createPlayerState(playerId);
            baseState.hand = [];
            baseState.playedCards = [];
            baseState.secretCards = [];
            baseState.discardedCards = [];
            baseState.actionTokens = ACTION_SEQUENCE.map((type) => ({ type, used: false }));
            baseState.score = baseState.score || { charm: 0, tokens: 0 };
            return baseState;
        });

        if (!this.gameState) {
            this.gameState = {
                gameId: this.roomId,
                players: refreshedPlayers,
                geishas: cloneGeishas(),
                currentPlayer: 0,
                phase: 'playing',
                round: this.round,
                winner: undefined,
                orderDecision: {
                    isOpen: false,
                    phase: 'result',
                    players: orderedPlayers,
                    result: {
                        firstPlayer: orderedPlayers[0],
                        secondPlayer: orderedPlayers[1] || orderedPlayers[0],
                        order: orderedPlayers
                    },
                    confirmations: [],
                    waitingFor: [],
                    currentPlayer: ''
                },
                drawPile: [],
                discardPile: [],
                removedCard: undefined,
                pendingInteraction: null,
                lastAction: undefined
            };
        } else {
            this.gameState.players = refreshedPlayers;
            this.gameState.phase = 'playing';
            this.gameState.round = this.round;
            this.gameState.winner = undefined;
            this.gameState.orderDecision = {
                isOpen: false,
                phase: 'result',
                players: orderedPlayers,
                result: {
                    firstPlayer: orderedPlayers[0],
                    secondPlayer: orderedPlayers[1] || orderedPlayers[0],
                    order: orderedPlayers
                },
                confirmations: [],
                waitingFor: [],
                currentPlayer: ''
            };
            this.gameState.lastAction = undefined;
        }

        refreshedPlayers.forEach((player) => {
            for (let draw = 0; draw < 6; draw++) {
                if (this.drawPile.length === 0) {
                    break;
                }
                const card = this.drawPile.pop();
                player.hand.push(card);
            }
        });

        this.syncDerivedState();
        this.startTurn(startingPlayerId, true);
    }

    startTurn(playerId, broadcast = false) {
        if (!this.gameState) {
            return;
        }
        const playerIndex = this.gameState.players.findIndex((player) => player.id === playerId);
        if (playerIndex === -1) {
            return;
        }

        if (this.drawPile.length > 0) {
            const card = this.drawPile.pop();
            this.gameState.players[playerIndex].hand.push(card);
        }

        this.gameState.currentPlayer = playerIndex;
        this.gameState.pendingInteraction = null;
        this.pendingInteraction = null;

        if (broadcast) {
            this.broadcastState();
        }
    }

    setPendingInteraction(interaction) {
        this.pendingInteraction = interaction;
        if (this.gameState) {
            this.gameState.pendingInteraction = interaction;
            const targetIndex = this.gameState.players.findIndex((player) => player.id === interaction.targetPlayerId);
            if (targetIndex !== -1) {
                this.gameState.currentPlayer = targetIndex;
            }
        }
        this.broadcastState();
    }

    completeAction(playerId, actionType) {
        if (!this.gameState) {
            return;
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return;
        }
        const token = player.actionTokens.find((item) => item.type === actionType);
        if (token) {
            token.used = true;
        }
        this.gameState.lastAction = {
            playerId,
            action: actionType
        };
    }

    findNextPlayerId(afterPlayerId) {
        if (!this.gameState) {
            return null;
        }
        const order = this.currentOrder.length > 0 ? this.currentOrder : this.gameState.players.map((p) => p.id);
        if (order.length === 0) {
            return null;
        }
        const startIndex = order.indexOf(afterPlayerId);
        for (let offset = 1; offset <= order.length; offset++) {
            const candidateId = order[(startIndex + offset) % order.length];
            const player = this.getPlayerState(candidateId);
            if (player && player.actionTokens.some((token) => !token.used)) {
                return candidateId;
            }
        }
        return null;
    }

    evaluateRoundEnd(playerId) {
        const opponentId = this.getOpponentId(playerId);
        const remaining = this.gameState.players.filter((player) => player.actionTokens.some((token) => !token.used));
        if (remaining.length === 0) {
            this.resolveRound();
            return;
        }
        const nextPlayerId = this.findNextPlayerId(playerId) || opponentId;
        if (nextPlayerId) {
            this.startTurn(nextPlayerId, true);
        } else {
            this.resolveRound();
        }
    }

    resolveRound() {
        if (!this.gameState) {
            return;
        }

        // 將秘密卡片加入場上計算
        this.gameState.players.forEach((player) => {
            if (player.secretCards.length > 0) {
                player.playedCards.push(...player.secretCards);
                player.secretCards = [];
            }
        });

        const controlMap = new Map();
        this.gameState.geishas.forEach((geisha) => {
            const playerAScore = this.gameState.players[0].playedCards.filter((card) => card.geishaId === geisha.id).length;
            const playerBScore = this.gameState.players[1]?.playedCards.filter((card) => card.geishaId === geisha.id).length || 0;
            if (playerAScore === playerBScore) {
                controlMap.set(geisha.id, geisha.controlledBy || null);
            } else if (playerAScore > playerBScore) {
                controlMap.set(geisha.id, this.gameState.players[0].id);
            } else {
                controlMap.set(geisha.id, this.gameState.players[1].id);
            }
        });

        this.gameState.geishas = this.gameState.geishas.map((geisha) => ({
            ...geisha,
            controlledBy: controlMap.get(geisha.id)
        }));

        this.gameState.players.forEach((player) => {
            const controlled = this.gameState.geishas.filter((geisha) => geisha.controlledBy === player.id);
            player.score = {
                tokens: controlled.length,
                charm: controlled.reduce((sum, geisha) => sum + geisha.charmPoints, 0)
            };
        });

        const winner = this.gameState.players.find((player) => player.score.tokens >= 4 || player.score.charm >= 11);
        if (winner) {
            this.gameState.phase = 'ended';
            this.gameState.winner = winner.id;
            this.broadcastState('GAME_ENDED');
            return;
        }

        this.round += 1;
        this.startingPlayerIndex = (this.startingPlayerIndex + 1) % this.currentOrder.length;
        const nextStartingPlayerId = this.currentOrder[this.startingPlayerIndex];
        this.prepareNewRound(nextStartingPlayerId);
    }

    ensureActionAvailable(playerId, actionType) {
        const player = this.getPlayerState(playerId);
        if (!player) {
            return false;
        }
        const token = player.actionTokens.find((item) => item.type === actionType);
        return !!token && !token.used;
    }

    validateCardOwnership(player, cardIds) {
        return cardIds.every((cardId) => player.hand.some((card) => card.id === cardId));
    }

    removeCardsFromHand(player, cardIds) {
        const removedCards = [];
        cardIds.forEach((cardId) => {
            const index = player.hand.findIndex((card) => card.id === cardId);
            if (index !== -1) {
                removedCards.push(player.hand.splice(index, 1)[0]);
            }
        });
        return removedCards;
    }

    handleGameAction(playerId, action) {
        if (!this.gameState || this.gameState.phase !== 'playing') {
            return { success: false, message: '遊戲尚未開始' };
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return { success: false, message: '找不到玩家' };
        }
        const isResolveAction = action.type === 'RESOLVE_GIFT' || action.type === 'RESOLVE_COMPETITION';
        const currentPlayerId = this.gameState.players[this.gameState.currentPlayer]?.id;
        if (!isResolveAction && playerId !== currentPlayerId) {
            return { success: false, message: '尚未輪到您' };
        }
        if (this.pendingInteraction && !isResolveAction) {
            return { success: false, message: '等待對手完成回應' };
        }
        if (this.pendingInteraction && this.pendingInteraction.type === 'GIFT_SELECTION' && this.pendingInteraction.targetPlayerId === playerId) {
            if (action.type !== 'RESOLVE_GIFT') {
                return { success: false, message: '請先完成贈予選擇' };
            }
        }
        if (this.pendingInteraction && this.pendingInteraction.type === 'COMPETITION_SELECTION' && this.pendingInteraction.targetPlayerId === playerId) {
            if (action.type !== 'RESOLVE_COMPETITION') {
                return { success: false, message: '請先完成競爭選擇' };
            }
        }

        switch (action.type) {
            case 'PLAY_SECRET':
                return this.performSecret(playerId, action.payload.cardId);
            case 'PLAY_TRADE_OFF':
                return this.performTradeOff(playerId, action.payload.cardIds);
            case 'INITIATE_GIFT':
                return this.performGift(playerId, action.payload.cardIds);
            case 'RESOLVE_GIFT':
                return this.resolveGift(playerId, action.payload.chosenCardId);
            case 'INITIATE_COMPETITION':
                return this.performCompetition(playerId, action.payload.groups);
            case 'RESOLVE_COMPETITION':
                return this.resolveCompetition(playerId, action.payload.chosenGroupIndex);
            default:
                return { success: false, message: '未知的遊戲動作' };
        }
    }

    performSecret(playerId, cardId) {
        if (!this.ensureActionAvailable(playerId, 'secret')) {
            return { success: false, message: '密約已使用' };
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return { success: false, message: '找不到玩家' };
        }
        if (!this.validateCardOwnership(player, [cardId])) {
            return { success: false, message: '手牌中沒有指定卡片' };
        }
        const [card] = this.removeCardsFromHand(player, [cardId]);
        player.secretCards.push(card);
        this.completeAction(playerId, 'secret');
        this.broadcastState();
        this.evaluateRoundEnd(playerId);
        return { success: true };
    }

    performTradeOff(playerId, cardIds) {
        if (!this.ensureActionAvailable(playerId, 'trade-off')) {
            return { success: false, message: '取捨已使用' };
        }
        if (cardIds.length !== ACTION_CARD_REQUIREMENT['trade-off']) {
            return { success: false, message: '需要選擇兩張卡片' };
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return { success: false, message: '找不到玩家' };
        }
        if (!this.validateCardOwnership(player, cardIds)) {
            return { success: false, message: '手牌中沒有指定卡片' };
        }
        const removed = this.removeCardsFromHand(player, cardIds);
        player.discardedCards.push(...removed);
        this.discardPile.push(...removed);
        this.completeAction(playerId, 'trade-off');
        this.broadcastState();
        this.evaluateRoundEnd(playerId);
        return { success: true };
    }

    performGift(playerId, cardIds) {
        if (!this.ensureActionAvailable(playerId, 'gift')) {
            return { success: false, message: '贈予已使用' };
        }
        if (cardIds.length !== ACTION_CARD_REQUIREMENT.gift) {
            return { success: false, message: '需要選擇三張卡片' };
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return { success: false, message: '找不到玩家' };
        }
        if (!this.validateCardOwnership(player, cardIds)) {
            return { success: false, message: '手牌中沒有指定卡片' };
        }
        const offered = this.removeCardsFromHand(player, cardIds);
        const opponentId = this.getOpponentId(playerId);
        if (!opponentId) {
            return { success: false, message: '缺少對手' };
        }
        this.setPendingInteraction({
            type: 'GIFT_SELECTION',
            initiatorId: playerId,
            targetPlayerId: opponentId,
            offeredCards: offered
        });
        return { success: true };
    }

    resolveGift(playerId, chosenCardId) {
        if (!this.pendingInteraction || this.pendingInteraction.type !== 'GIFT_SELECTION') {
            return { success: false, message: '目前沒有贈予待處理' };
        }
        if (this.pendingInteraction.targetPlayerId !== playerId) {
            return { success: false, message: '尚未輪到您選擇' };
        }
        const opponent = this.getPlayerState(playerId);
        const initiatorId = this.pendingInteraction.initiatorId;
        const initiator = this.getPlayerState(initiatorId);
        if (!opponent || !initiator) {
            return { success: false, message: '找不到玩家' };
        }
        const offered = this.pendingInteraction.offeredCards;
        const chosen = offered.find((card) => card.id === chosenCardId);
        if (!chosen) {
            return { success: false, message: '選擇的卡片不存在' };
        }
        opponent.playedCards.push(chosen);
        const remaining = offered.filter((card) => card.id !== chosenCardId);
        initiator.playedCards.push(...remaining);
        this.completeAction(initiatorId, 'gift');
        this.pendingInteraction = null;
        this.gameState.pendingInteraction = null;
        this.broadcastState();
        this.evaluateRoundEnd(initiatorId);
        return { success: true };
    }

    performCompetition(playerId, groups) {
        if (!this.ensureActionAvailable(playerId, 'competition')) {
            return { success: false, message: '競爭已使用' };
        }
        if (groups.length !== 2) {
            return { success: false, message: '需要兩組卡片' };
        }
        const flattened = groups.flat();
        if (flattened.length !== ACTION_CARD_REQUIREMENT.competition) {
            return { success: false, message: '需要四張卡片' };
        }
        const player = this.getPlayerState(playerId);
        if (!player) {
            return { success: false, message: '找不到玩家' };
        }
        if (!this.validateCardOwnership(player, flattened)) {
            return { success: false, message: '手牌中沒有指定卡片' };
        }
        const removed = this.removeCardsFromHand(player, flattened);
        const mapping = removed.reduce((acc, card) => {
            acc[card.id] = card;
            return acc;
        }, {});
        const normalizedGroups = groups.map((ids) => ids.map((cardId) => mapping[cardId]).filter(Boolean));
        if (normalizedGroups.some((group) => group.length !== 2)) {
            player.hand.push(...removed);
            return { success: false, message: '每一組需要兩張卡片' };
        }
        const opponentId = this.getOpponentId(playerId);
        if (!opponentId) {
            return { success: false, message: '缺少對手' };
        }
        this.setPendingInteraction({
            type: 'COMPETITION_SELECTION',
            initiatorId: playerId,
            targetPlayerId: opponentId,
            groups: normalizedGroups
        });
        return { success: true };
    }

    resolveCompetition(playerId, chosenGroupIndex) {
        if (!this.pendingInteraction || this.pendingInteraction.type !== 'COMPETITION_SELECTION') {
            return { success: false, message: '目前沒有競爭待處理' };
        }
        if (this.pendingInteraction.targetPlayerId !== playerId) {
            return { success: false, message: '尚未輪到您選擇' };
        }
        const opponent = this.getPlayerState(playerId);
        const initiatorId = this.pendingInteraction.initiatorId;
        const initiator = this.getPlayerState(initiatorId);
        if (!opponent || !initiator) {
            return { success: false, message: '找不到玩家' };
        }
        const groups = this.pendingInteraction.groups;
        const chosen = groups[chosenGroupIndex];
        if (!chosen) {
            return { success: false, message: '無效的組合索引' };
        }
        const remaining = groups.filter((_group, index) => index !== chosenGroupIndex).flat();
        opponent.playedCards.push(...chosen);
        initiator.playedCards.push(...remaining);
        this.completeAction(initiatorId, 'competition');
        this.pendingInteraction = null;
        this.gameState.pendingInteraction = null;
        this.broadcastState();
        this.evaluateRoundEnd(initiatorId);
        return { success: true };
    }

    // 開始隨機決定順序
    startOrderDecision() {
        console.log(`🎲 房間 ${this.roomId} 開始隨機決定玩家順序`);

        this.orderDecisionState.isDeciding = true;
        this.orderDecisionState.confirmations.clear();

        // 廣播開始決定順序
        this.broadcast({
            type: 'ORDER_DECISION_START',
            payload: {
                players: this.players.map(p => p.playerId)
            }
        });

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

        // 廣播結果
        this.broadcast({
            type: 'ORDER_DECISION_RESULT',
            payload: this.orderDecisionState.result
        });
    }

    // 處理玩家確認
    confirmOrder(playerId) {
        if (!this.orderDecisionState.result) {
            console.warn(`⚠️ 玩家 ${playerId} 嘗試確認，但順序尚未決定`);
            return;
        }

        this.orderDecisionState.confirmations.add(playerId);
        console.log(`✅ 玩家 ${playerId} 已確認順序，目前確認數: ${this.orderDecisionState.confirmations.size}/2`);

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
        this.currentOrder = order;
        this.round = 1;
        this.startingPlayerIndex = 0;
        this.prepareNewRound(order[0]);

        console.log(`🚀 遊戲開始，房間 ${this.roomId}，順序：`, order);

        if (this.gameState) {
            this.broadcast({
                type: 'GAME_STARTED',
                payload: this.gameState
            });
        }

        this.orderDecisionState = {
            isDeciding: false,
            result: null,
            confirmations: new Set()
        };
    }
}

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

    function handleCreateRoom(ws, payload) {
        const roomId = generateRoomId();
        const room = new GameRoom(roomId);
        gameRooms.set(roomId, room);

        currentPlayerId = payload.playerId;
        currentRoomId = roomId;

        room.addPlayer(currentPlayerId, ws);

        console.log(`🏠 房間 ${roomId} 已建立，創建者：${currentPlayerId}，來源：${origin}`);

        ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { roomId, playerId: currentPlayerId }
        }));

        const initialGameState = createWaitingGameState(roomId, [currentPlayerId]);
        room.gameState = initialGameState;

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

        ws.send(JSON.stringify({
            type: 'PLAYER_JOINED',
            payload: { playerId, roomId }
        }));

        const updatedGameState = createWaitingGameState(roomId, room.players.map(p => p.playerId));
        room.gameState = updatedGameState;

        room.broadcast({
            type: 'GAME_STATE_UPDATED',
            payload: updatedGameState
        });

        // 如果房間滿了，開始隨機決定順序
        if (room.isFull()) {
            console.log(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`);
            setTimeout(() => {
                room.startOrderDecision();
            }, 1000);
        }
    }

    function handleConfirmOrder(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (room && currentPlayerId) {
            room.confirmOrder(currentPlayerId);
        }
    }

    function handleGameAction(ws, payload) {
        const room = gameRooms.get(currentRoomId);
        if (!room) {
            return;
        }
        const { action, playerId } = payload;
        if (!action || !playerId) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: '缺少動作內容或玩家資訊' }
            }));
            return;
        }
        const result = room.handleGameAction(playerId, action);
        if (!result.success) {
            ws.send(JSON.stringify({
                type: 'ERROR',
                payload: { message: result.message || '動作失敗' }
            }));
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

function createWaitingGameState(gameId, playerIds) {
    return {
        gameId,
        players: playerIds.map((id) => createPlayerState(id)),
        geishas: cloneGeishas(),
        currentPlayer: 0,
        phase: 'waiting',
        round: 1,
        winner: undefined,
        orderDecision: {
            isOpen: false,
            phase: 'deciding',
            players: playerIds,
            result: undefined,
            confirmations: [],
            waitingFor: [],
            currentPlayer: ''
        },
        drawPile: [],
        discardPile: [],
        removedCard: undefined,
        pendingInteraction: null,
        lastAction: undefined
    };
}

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
