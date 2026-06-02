// server/rooms/gameRoom.ts - authoritative room runtime
import type {
    ActionType,
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    createRandomizedGeishas,
    createCustomSelectedGeishas,
    type PlayerMetaMap,
    type ServerGameState
} from '../utils/gameUtils.js';
import {
    backendLogger,
    summarizeGameState
} from '../utils/runtimeLogger.js';
import {
    type RoomSeat,
    type RoomSocketLike
} from '../utils/roomSession.js';
import {
    getNpcThinkingDelay,
    type NpcDifficulty
} from '../npc/npcConfig.js';
import {
    buildPreparedRoundState,
    inspectRoundSetup,
    type DealSequenceStep
} from '../game/roundPreparation.js';
import {
    buildConfirmationUpdate,
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import {
    buildReadyCheckState,
    buildRematchConfirmationUpdate
} from '../game/matchConfirmationFlow.js';
import {
    getActionAvailabilityError,
    type ServerAction
} from '../game/actionValidation.js';
import { GEISHA_SET_CONFIG_ERROR_MESSAGE } from './roomErrors.js';
import { type RestorableRoomLike } from './roomRestore.js';
import {
    buildRoomSnapshot,
    persistRoomSnapshot,
    type RoomSnapshot
} from './roomSnapshot.js';
import {
    addRoomPlayer,
    buildPlayerMetaMap,
    detachRoomPlayer,
    removeRoomPlayer,
    type PlayerMetaPayload
} from './roomMembership.js';
import {
    broadcastRoomMessage,
    buildMaskedDealSequence,
    buildPendingInteractionMessages,
    buildViewerGameState,
    sendRoomMessage,
    type WireMessage
} from './roomMessaging.js';
import {
    roomScheduler,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';
import {
    buildRoomNpcAction,
    buildNpcSeat,
    clearRoomNpcTimers,
    performRoomNpcAction,
    performRoomNpcResponse,
    scheduleRoomNpcResponse,
    scheduleRoomNpcTurn
} from './roomNpcRuntime.js';
import {
    handleRoomAction,
    handleRoomInitiateCompetition,
    handleRoomInitiateGift,
    handleRoomPlaySecret,
    handleRoomResolveCompetition,
    handleRoomResolveGift,
    handleRoomTradeOff,
    validateRoomPendingInteraction
} from './roomActionRuntime.js';
import {
    beginRoomTurnForCurrentPlayer,
    endRoomTurn,
    resolveRoomRound,
    scheduleRoomNextRound,
    startRoomNextRound
} from './roomTurnRoundRuntime.js';
import {
    confirmRoomOrder,
    decideRoomOrder,
    prepareRoomOrderDecisionState,
    startRoomGameWithOrder,
    startRoomOrderDecision
} from './roomOpeningRuntime.js';
import { resumeRestoredRoomRuntime } from './roomRuntimeResume.js';

type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

type GameRoomPlayer = RoomSeat & {
    sessionToken?: string;
};

type GamePlayer = ServerGameState['players'][number];

export class GameRoom implements RestorableRoomLike {
    roomId: string;
    createdAt: number;
    players: GameRoomPlayer[];
    gameState: ServerGameState | null;
    maxPlayers: number;
    hostId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    orderDecisionState: OrderDecisionState;
    baseGeishas: Geisha[] | null;
    dealSequence: DealSequenceStep[];
    lastRoundStarterId: string | null;
    roundResolveTimer: TimerHandle | null;
    npcId: string | null;
    npcDifficulty: NpcDifficulty | null;
    npcActionTimer: TimerHandle | null;
    npcResponseTimer: TimerHandle | null;
    rematchConfirmations: Set<string>;
    readyConfirmations: Set<string>;
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    scheduler: RoomScheduler;

    constructor(roomId: string, scheduler: RoomScheduler = roomScheduler) {
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
        // 建房角色設定模式
        this.setupMode = DEFAULT_ROOM_SETUP_MODE;
        this.customSelection = null;
        this.orderDecisionState = createOrderDecisionState();
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
        this.matchCompletionCounter = 0;
        this.currentCompletionId = null;
        this.scheduler = scheduler;
    }

    // 產出可儲存的房間快照（不含連線物件）
    buildRoomSnapshot(): RoomSnapshot {
        return buildRoomSnapshot(this);
    }

    // 儲存房間快照（Redis 可用時）
    persistRoomSnapshot(): void {
        persistRoomSnapshot(this);
    }

    // 判斷是否為 NPC 玩家
    isNpcPlayerId(playerId: string): boolean {
        return Boolean(this.npcId) && playerId === this.npcId;
    }

    // 建立 NPC 玩家（使用假連線避免廣播錯誤）
    addNpcPlayer(difficulty: unknown = 'easy'): string | null {
        if (this.npcId || this.players.length >= this.maxPlayers) {
            return null;
        }

        const update = buildNpcSeat(difficulty);
        this.players.push(update.seat);
        this.npcId = update.npcId;
        this.npcDifficulty = update.difficulty;

        backendLogger.info(`🤖 NPC 玩家加入房間 ${this.roomId}`, {
            roomId: this.roomId,
            npcId: update.npcId,
            difficulty: update.difficulty
        });
        return update.npcId;
    }

    getPlayerMetaMap(): PlayerMetaMap {
        return buildPlayerMetaMap(this.players);
    }

    // 清除 NPC 計時器（避免重複執行）
    clearNpcTimers(): void {
        clearRoomNpcTimers(this);
    }

    regenerateBaseGeishas(): boolean {
        try {
            const activeGeishaSet = this.geishaSet ?? DEFAULT_GEISHA_SET;
            this.baseGeishas = this.setupMode === 'custom'
                ? createCustomSelectedGeishas(activeGeishaSet, this.customSelection ?? undefined)
                : createRandomizedGeishas(activeGeishaSet);
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

    ensureBaseGeishas(): boolean {
        if (this.baseGeishas) {
            return true;
        }

        return this.regenerateBaseGeishas();
    }

    // 送出再來一場請求
    requestRematch(playerId: string): void {
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        const update = buildRematchConfirmationUpdate(
            this.players.map(player => player.playerId),
            this.rematchConfirmations,
            playerId,
            this.npcId
        );
        this.rematchConfirmations = new Set(update.confirmations);

        if (update.shouldStartRematch) {
            this.startRematch();
        } else {
            this.broadcast({
                type: 'REMATCH_REQUESTED',
                payload: {
                    confirmations: update.confirmations
                }
            });
        }
    }

    // 開始準備確認流程
    startReadyCheck(): void {
        if (!this.gameState) {
            return;
        }

        const playerIds = this.players.map(player => player.playerId);
        const readyState = buildReadyCheckState(playerIds);
        this.readyConfirmations = new Set(readyState.confirmations);

        this.broadcast({
            type: 'READY_CHECK',
            payload: {
                confirmations: readyState.confirmations,
                waitingFor: readyState.waitingFor
            }
        });

        if (this.npcId) {
            const delay = getNpcThinkingDelay(this.npcDifficulty);
            this.scheduler.setTimeout(() => {
                if (this.npcId) {
                    this.confirmReady(this.npcId);
                }
            }, delay);
        }
    }

    // 玩家確認準備完成
    confirmReady(playerId: string): void {
        if (!this.validatePlayerInRoom(playerId)) {
            return;
        }

        if (!this.orderDecisionState.result || this.gameState?.phase !== 'deciding_order') {
            backendLogger.info(`ℹ️ 玩家 ${playerId} 的準備確認不在有效開局階段，忽略重送`, {
                roomId: this.roomId,
                playerId,
                phase: this.gameState?.phase
            });
            return;
        }

        const update = buildConfirmationUpdate(
            this.players.map(player => player.playerId),
            this.readyConfirmations,
            playerId
        );
        if (!update.added) {
            backendLogger.info(`ℹ️ 玩家 ${playerId} 重複準備確認，忽略重送`, {
                roomId: this.roomId,
                playerId
            });
            return;
        }

        this.readyConfirmations = new Set(update.confirmations);

        this.broadcast({
            type: 'READY_STATUS',
            payload: {
                confirmations: update.confirmations,
                waitingFor: update.waitingFor
            }
        });

        if (update.waitingFor.length === 0) {
            this.startGameWithOrder();
        }
    }

    // 重新開始對戰（保留同房間與玩家）
    startRematch() {
        backendLogger.info(`🔁 房間 ${this.roomId} 重新開始對戰`, {
            roomId: this.roomId,
            geishaSet: this.geishaSet,
            setupMode: this.setupMode
        });

        this.clearNpcTimers();
        this.rematchConfirmations.clear();
        this.lastRoundStarterId = null;
        this.currentCompletionId = null;
        if (!this.regenerateBaseGeishas()) {
            return;
        }
        this.orderDecisionState = createOrderDecisionState();

        this.startOrderDecision();
    }

    // 將訊息傳送給指定玩家（避免廣播時洩漏資訊）
    sendToPlayer(playerId: string, message: WireMessage): void {
        sendRoomMessage(this.roomId, this.players, playerId, message);
    }

    // 傳送錯誤訊息給指定玩家（統一錯誤回傳格式）
    sendError(playerId: string, message: string, code?: string): void {
        this.sendToPlayer(playerId, {
            type: 'ERROR',
            payload: {
                message,
                ...(code ? { code } : {})
            }
        });
    }

    sendPendingInteractionState(): void {
        const pendingInteraction = this.gameState?.pendingInteraction;
        if (!pendingInteraction) {
            return;
        }

        buildPendingInteractionMessages(this.players, pendingInteraction).forEach(({ playerId, message }) => {
            this.sendToPlayer(playerId, message);
        });
    }

    // 將遊戲狀態整理成玩家可見版本（隱藏對手手牌與密約資訊）
    buildClientGameState(viewerId: string): ServerGameState | null {
        if (!this.gameState) {
            return null;
        }

        const visibleState = buildViewerGameState(this.gameState, viewerId, this.geishaSet ?? DEFAULT_GEISHA_SET);
        if (visibleState?.geishaSet && !this.gameState.geishaSet) {
            this.gameState.geishaSet = visibleState.geishaSet;
        }
        return visibleState;
    }

    // 依玩家視角建立發牌動畫序列（開局動畫一律只顯示背面）
    buildDealSequenceForPlayer(playerId: string) {
        return buildMaskedDealSequence(this.dealSequence, playerId);
    }

    // 加入玩家到房間，並回傳加入結果
    addPlayer(playerId: string, ws: RoomSocketLike, meta: PlayerMetaPayload = {}) {
        const update = addRoomPlayer(this.players, this.maxPlayers, playerId, ws, meta);
        if (update.result === 'invalid') {
            backendLogger.warn('⚠️ 嘗試加入房間但 playerId 為空', {
                roomId: this.roomId
            });
            return 'invalid';
        }

        if (update.result === 'session-mismatch') {
            backendLogger.warn(`⚠️ 玩家 ${playerId} 嘗試以不符 session token 重新加入房間 ${this.roomId}`, {
                roomId: this.roomId,
                playerId
            });
            return 'session-mismatch';
        }

        if (update.result === 'existing') {
            this.players = update.seats;
            backendLogger.info(`♻️ 玩家 ${playerId} 重新連線房間 ${this.roomId}`, {
                roomId: this.roomId,
                playerId
            });
            this.persistRoomSnapshot();
            return 'existing';
        }

        if (update.result === 'full') {
            return 'full';
        }

        this.players = update.seats;
        backendLogger.info(`✅ 玩家 ${playerId} 加入房間 ${this.roomId}`, {
            roomId: this.roomId,
            playerId,
            playerCount: this.players.length
        });
        this.persistRoomSnapshot();
        return 'added';
    }

    // 從房間移除玩家
    removePlayer(playerId: string, ws: RoomSocketLike | null = null): boolean {
        const nextPlayers = removeRoomPlayer(this.players, playerId, ws);
        if (nextPlayers.length === this.players.length) {
            return false;
        }

        this.players = nextPlayers;
        backendLogger.info(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}`, {
            roomId: this.roomId,
            playerId,
            playerCount: this.players.length
        });
        this.persistRoomSnapshot();
        return true;
    }

    detachPlayerConnection(playerId: string, ws: RoomSocketLike | null = null) {
        const update = detachRoomPlayer(this.players, playerId, ws);
        if (!update.detached) {
            return false;
        }

        this.players = update.seats;
        backendLogger.info(`🔌 玩家 ${playerId} 已斷線但保留房間座位`, {
            roomId: this.roomId,
            playerId,
            phase: this.gameState?.phase
        });
        this.persistRoomSnapshot();
        return true;
    }

    // 廣播訊息給房間內所有玩家（非狀態同步使用）
    broadcast(message: WireMessage, excludePlayerId: string | null = null): void {
        broadcastRoomMessage(this.roomId, this.players, message, excludePlayerId);
    }

    // 檢查房間是否已滿員
    isFull(): boolean {
        return this.players.length === this.maxPlayers;
    }

    // 準備新回合的初始狀態（洗牌、移除卡、發牌）
    prepareRoundState({ orderedPlayerIds = null, roundNumber = null, openOrderDecision = true }: RoundPreparationOptions = {}) {
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

        const baseGeishas = this.baseGeishas;
        if (!baseGeishas) {
            return;
        }

        const resolvedRound = roundNumber ?? this.gameState?.round ?? 1;
        const preparation = buildPreparedRoundState({
            roomId: this.roomId,
            hostId: this.hostId,
            playerIds,
            baseGeishas,
            playerMetaMap: this.getPlayerMetaMap(),
            roundNumber: resolvedRound,
            openOrderDecision
        });
        if (!preparation.ok) {
            backendLogger.error(`❌ 房間 ${this.roomId} 準備回合失敗`, {
                roomId: this.roomId,
                error: preparation.errorMessage
            });
            return;
        }
        this.dealSequence = preparation.dealSequence;
        this.gameState = preparation.gameState;

        backendLogger.info(`🃏 房間 ${this.roomId} 已準備新回合`, {
            roomId: this.roomId,
            dealSequenceLength: this.dealSequence.length,
            ...summarizeGameState(this.gameState)
        });

        // 回合初始化檢查（避免發牌數量或重複卡異常）
        this.validateRoundSetup();
    }

    // 準備順序決定狀態；真正開局牌務要等雙方確認順序後才建立
    prepareOrderDecisionState(): boolean {
        return prepareRoomOrderDecisionState(this);
    }

    // 開始隨機決定順序
    startOrderDecision(): void {
        startRoomOrderDecision(this);
    }

    // 決定順序並廣播結果
    decideOrder(): void {
        decideRoomOrder(this);
    }

    // 處理玩家確認
    confirmOrder(playerId: string): void {
        confirmRoomOrder(this, playerId);
    }

    // 根據決定的順序開始遊戲
    startGameWithOrder(): void {
        startRoomGameWithOrder(this);
    }

    // 傳送指定事件與可見遊戲狀態（避免資料外洩）
    broadcastGameStateEvent(eventType: string): void {
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
    broadcastGameState(): void {
        this.broadcastGameStateEvent('GAME_STATE_UPDATED');
    }

    // 取得玩家的遊戲狀態資料
    getPlayerState(playerId: string): GamePlayer | null {
        if (!this.gameState) {
            return null;
        }

        return this.gameState.players.find(player => player.id === playerId) ?? null;
    }

    // 取得對手玩家 ID
    getOpponentId(playerId: string): string | null {
        return this.players
            .map(player => player.playerId)
            .find(id => id !== playerId) ?? null;
    }

    // 取得對手玩家狀態
    getOpponentState(playerId: string): GamePlayer | null {
        const opponentId = this.getOpponentId(playerId);
        if (!opponentId) {
            return null;
        }
        return this.getPlayerState(opponentId);
    }

    // 開始當前玩家回合（抽牌、重置互動狀態）
    beginTurnForCurrentPlayer(): void {
        beginRoomTurnForCurrentPlayer(this);
    }

    // 安排 NPC 行動
    scheduleNpcTurn(): void {
        scheduleRoomNpcTurn(this);
    }

    // 安排 NPC 回應互動（贈予/競爭）
    scheduleNpcResponse(): void {
        scheduleRoomNpcResponse(this);
    }

    scheduleNextRound(): void {
        scheduleRoomNextRound(this);
    }

    resumeRestoredRuntime(): void {
        resumeRestoredRoomRuntime(this);
    }

    // NPC 執行回合行動
    performNpcAction(): void {
        performRoomNpcAction(this);
    }

    // NPC 回應互動（贈予/競爭）
    performNpcResponse(): void {
        performRoomNpcResponse(this);
    }

    // NPC 決定要執行的行動與卡片
    buildNpcAction(player: GamePlayer): ServerAction | null {
        return buildRoomNpcAction(this, player);
    }

    // 結束回合並切換到下一位可行動玩家
    endTurn(): void {
        endRoomTurn(this);
    }

    // 結算回合（翻開密約、計算好感、檢查勝利）
    resolveRound(): void {
        resolveRoomRound(this);
    }

    // 驗證回合發牌與牌堆分配是否正確（用於偵錯與防呆）
    validateRoundSetup(): void {
        if (!this.gameState) {
            return;
        }

        const diagnostics = inspectRoundSetup(this.gameState);

        // 規則：21 張牌中移除 1 張，剩 20 張進行發牌與牌堆
        if (diagnostics.hasUnexpectedTotalCards) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 牌數異常`, {
                roomId: this.roomId,
                totalCardsInGame: diagnostics.totalCardsInGame,
                expectedCards: 21
            });
        }

        if (diagnostics.hasUnexpectedHandSizes) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 手牌數量異常`, {
                roomId: this.roomId,
                handSizes: diagnostics.handSizes.join(',')
            });
        }

        if (diagnostics.hasUnexpectedDrawPileSize) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 牌堆數量異常`, {
                roomId: this.roomId,
                drawPileSize: diagnostics.drawPileSize
            });
        }

        if (diagnostics.hasDuplicateCardIds) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 發現重複卡片 ID，請檢查洗牌與發牌流程`, {
                roomId: this.roomId
            });
        }
    }

    // 開始下一輪（不再重新決定順序，而是輪流先手）
    startNextRound(): void {
        startRoomNextRound(this);
    }

    // 驗證玩家是否存在於房間內
    validatePlayerInRoom(playerId: string): boolean {
        if (!this.players.some(player => player.playerId === playerId)) {
            this.sendError(playerId, '玩家不在房間內');
            return false;
        }
        return true;
    }

    // 驗證是否輪到該玩家行動
    validatePlayerTurn(playerId: string): boolean {
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
    validateActionAvailable(player: GamePlayer, actionType: ActionType): boolean {
        const errorMessage = getActionAvailabilityError(player, actionType);
        if (errorMessage) {
            this.sendError(player.id, errorMessage);
            return false;
        }
        return true;
    }

    // 驗證互動狀態（避免同時進行多個互動）
    validatePendingInteraction(actionType: string, playerId: string): boolean {
        return validateRoomPendingInteraction(this, actionType, playerId);
    }

    // 處理玩家送出的行動（入口）
    handleAction(playerId: string, action: ServerAction): void {
        handleRoomAction(this, playerId, action);
    }

    // 執行密約行動（選 1 張卡蓋牌）
    handlePlaySecret(player: GamePlayer, cardId?: string): void {
        handleRoomPlaySecret(this, player, cardId);
    }

    // 執行取捨行動（選 2 張卡丟棄）
    handleTradeOff(player: GamePlayer, cardIds: string[] = []): void {
        handleRoomTradeOff(this, player, cardIds);
    }

    // 執行贈予行動（選 3 張卡給對手挑）
    handleInitiateGift(player: GamePlayer, cardIds: string[] = []): void {
        handleRoomInitiateGift(this, player, cardIds);
    }

    // 處理對手回應贈予（選 1 張卡）
    handleResolveGift(playerId: string, chosenCardId?: string): void {
        handleRoomResolveGift(this, playerId, chosenCardId);
    }

    // 執行競爭行動（選 4 張卡分 2 組）
    handleInitiateCompetition(player: GamePlayer, groups: string[][] = []): void {
        handleRoomInitiateCompetition(this, player, groups);
    }

    // 處理對手回應競爭（選 1 組）
    handleResolveCompetition(playerId: string, chosenGroupIndex?: number): void {
        handleRoomResolveCompetition(this, playerId, chosenGroupIndex);
    }
}
