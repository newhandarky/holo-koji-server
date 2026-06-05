// server/rooms/gameRoom.ts - authoritative room runtime
import type {
    ActionType,
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../game/serverGameStateTypes.js';
import {
    type RoomSeat,
    type RoomSocketLike
} from '../utils/roomSession.js';
import { type NpcDifficulty } from '../npc/npcConfig.js';
import { type DealSequenceStep } from '../game/roundPreparation.js';
import {
    type OrderDecisionState
} from '../game/openingFlow.js';
import {
    type ServerAction
} from '../game/actionValidation.js';
import { type RestorableRoomLike } from './roomRestore.js';
import {
    buildRoomSnapshot,
    persistRoomSnapshot,
    type RoomSnapshot
} from './roomSnapshot.js';
import {
    type PlayerMetaPayload
} from './roomMembership.js';
import {
    type WireMessage
} from './roomMessaging.js';
import {
    roomScheduler,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';
import {
    addRoomNpcSeat,
    buildRoomNpcAction,
    clearRoomNpcTimers,
    performRoomNpcAction,
    performRoomNpcResponse,
    scheduleRoomNpcResponse,
    scheduleRoomNpcTurn
} from './roomNpcRuntime.js';
import {
    handleRoomAction,
    validateRoomPendingInteraction
} from './roomActionRuntime.js';
import {
    handleRoomPlaySecret,
    handleRoomTradeOff
} from './roomActiveActionRuntime.js';
import {
    handleRoomInitiateCompetition,
    handleRoomInitiateGift,
    handleRoomResolveCompetition,
    handleRoomResolveGift
} from './roomInteractionActionRuntime.js';
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
    startRoomOrderDecision
} from './roomOrderDecisionRuntime.js';
import { startRoomGameWithOrder } from './roomOpeningStartRuntime.js';
import { resumeRestoredRoomRuntime } from './roomRuntimeResume.js';
import {
    confirmRoomReady,
    requestRoomRematch,
    startRoomReadyCheck,
    startRoomRematch
} from './roomMatchRuntime.js';
import {
    ensureRoomBaseGeishas,
    prepareRoomRoundState,
    regenerateRoomBaseGeishas,
    validateRoomRoundSetup,
    type RoundPreparationOptions
} from './roomRoundSetupRuntime.js';
import {
    addRoomSeat,
    detachRoomSeatConnection,
    getRoomPlayerMetaMap,
    isRoomFull,
    removeRoomSeat
} from './roomSeatRuntime.js';
import {
    broadcastRoomClientMessage,
    broadcastRoomGameState,
    broadcastRoomGameStateEvent,
    buildRoomClientGameState,
    buildRoomDealSequenceForPlayer,
    sendRoomClientError,
    sendRoomClientMessage,
    sendRoomPendingInteractionState
} from './roomClientEventRuntime.js';
import {
    createInitialRoomState,
    getRoomOpponentId,
    getRoomOpponentState,
    getRoomPlayerState,
    isRoomNpcPlayerId
} from './roomStateRuntime.js';
import {
    validateRoomActionAvailable,
    validateRoomPlayerInRoom,
    validateRoomPlayerTurn
} from './roomActionGuards.js';

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
        const initialState = createInitialRoomState(roomId, scheduler);
        this.roomId = initialState.roomId;
        this.createdAt = initialState.createdAt;
        this.players = initialState.players;
        this.gameState = initialState.gameState;
        this.maxPlayers = initialState.maxPlayers;
        this.hostId = initialState.hostId;
        this.geishaSet = initialState.geishaSet;
        this.setupMode = initialState.setupMode;
        this.customSelection = initialState.customSelection;
        this.orderDecisionState = initialState.orderDecisionState;
        this.baseGeishas = initialState.baseGeishas;
        this.dealSequence = initialState.dealSequence;
        this.lastRoundStarterId = initialState.lastRoundStarterId;
        this.roundResolveTimer = initialState.roundResolveTimer;
        this.npcId = initialState.npcId;
        this.npcDifficulty = initialState.npcDifficulty;
        this.npcActionTimer = initialState.npcActionTimer;
        this.npcResponseTimer = initialState.npcResponseTimer;
        this.rematchConfirmations = initialState.rematchConfirmations;
        this.readyConfirmations = initialState.readyConfirmations;
        this.matchCompletionCounter = initialState.matchCompletionCounter;
        this.currentCompletionId = initialState.currentCompletionId;
        this.scheduler = initialState.scheduler;
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
        return isRoomNpcPlayerId(this, playerId);
    }

    // 建立 NPC 玩家（使用假連線避免廣播錯誤）
    addNpcPlayer(difficulty: unknown = 'easy'): string | null {
        return addRoomNpcSeat(this, difficulty);
    }

    getPlayerMetaMap(): PlayerMetaMap {
        return getRoomPlayerMetaMap(this);
    }

    // 清除 NPC 計時器（避免重複執行）
    clearNpcTimers(): void {
        clearRoomNpcTimers(this);
    }

    regenerateBaseGeishas(): boolean {
        return regenerateRoomBaseGeishas(this);
    }

    ensureBaseGeishas(): boolean {
        return ensureRoomBaseGeishas(this);
    }

    // 送出再來一場請求
    requestRematch(playerId: string): void {
        requestRoomRematch(this, playerId);
    }

    // 開始準備確認流程
    startReadyCheck(): void {
        startRoomReadyCheck(this);
    }

    // 玩家確認準備完成
    confirmReady(playerId: string): void {
        confirmRoomReady(this, playerId);
    }

    // 重新開始對戰（保留同房間與玩家）
    startRematch() {
        startRoomRematch(this);
    }

    // 將訊息傳送給指定玩家（避免廣播時洩漏資訊）
    sendToPlayer(playerId: string, message: WireMessage): void {
        sendRoomClientMessage(this, playerId, message);
    }

    // 傳送錯誤訊息給指定玩家（統一錯誤回傳格式）
    sendError(playerId: string, message: string, code?: string): void {
        sendRoomClientError(this, playerId, message, code);
    }

    sendPendingInteractionState(): void {
        sendRoomPendingInteractionState(this);
    }

    // 將遊戲狀態整理成玩家可見版本（隱藏對手手牌與密約資訊）
    buildClientGameState(viewerId: string): ServerGameState | null {
        return buildRoomClientGameState(this, viewerId);
    }

    // 依玩家視角建立發牌動畫序列（開局動畫一律只顯示背面）
    buildDealSequenceForPlayer(playerId: string) {
        return buildRoomDealSequenceForPlayer(this, playerId);
    }

    // 加入玩家到房間，並回傳加入結果
    addPlayer(playerId: string, ws: RoomSocketLike, meta: PlayerMetaPayload = {}) {
        return addRoomSeat(this, playerId, ws, meta);
    }

    // 從房間移除玩家
    removePlayer(playerId: string, ws: RoomSocketLike | null = null): boolean {
        return removeRoomSeat(this, playerId, ws);
    }

    detachPlayerConnection(playerId: string, ws: RoomSocketLike | null = null) {
        return detachRoomSeatConnection(this, playerId, ws);
    }

    // 廣播訊息給房間內所有玩家（非狀態同步使用）
    broadcast(message: WireMessage, excludePlayerId: string | null = null): void {
        broadcastRoomClientMessage(this, message, excludePlayerId);
    }

    // 檢查房間是否已滿員
    isFull(): boolean {
        return isRoomFull(this);
    }

    // 準備新回合的初始狀態（洗牌、移除卡、發牌）
    prepareRoundState({ orderedPlayerIds = null, roundNumber = null, openOrderDecision = true }: RoundPreparationOptions = {}) {
        prepareRoomRoundState(this, { orderedPlayerIds, roundNumber, openOrderDecision });
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
        broadcastRoomGameStateEvent(this, eventType);
    }

    // 廣播可見狀態（標準狀態同步事件）
    broadcastGameState(): void {
        broadcastRoomGameState(this);
    }

    // 取得玩家的遊戲狀態資料
    getPlayerState(playerId: string): GamePlayer | null {
        return getRoomPlayerState(this, playerId);
    }

    // 取得對手玩家 ID
    getOpponentId(playerId: string): string | null {
        return getRoomOpponentId(this, playerId);
    }

    // 取得對手玩家狀態
    getOpponentState(playerId: string): GamePlayer | null {
        return getRoomOpponentState(this, playerId);
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
        validateRoomRoundSetup(this);
    }

    // 開始下一輪（不再重新決定順序，而是輪流先手）
    startNextRound(): void {
        startRoomNextRound(this);
    }

    // 驗證玩家是否存在於房間內
    validatePlayerInRoom(playerId: string): boolean {
        return validateRoomPlayerInRoom(this, playerId);
    }

    // 驗證是否輪到該玩家行動
    validatePlayerTurn(playerId: string): boolean {
        return validateRoomPlayerTurn(this, playerId);
    }

    // 驗證玩家行動指示物是否可用
    validateActionAvailable(player: GamePlayer, actionType: ActionType): boolean {
        return validateRoomActionAvailable(this, player, actionType);
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
