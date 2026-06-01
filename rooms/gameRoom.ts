// server/rooms/gameRoom.ts - authoritative room runtime
import { randomBytes } from 'node:crypto';
import type {
    ActionType,
    CustomCharacterSelection,
    GameState,
    Geisha,
    GeishaSet,
    ItemCard,
    LineAccountProfile,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    createRandomizedGeishas,
    createCustomSelectedGeishas,
    cloneGeishasForNextRound,
    buildPlayerVisibleGameState,
    sanitizePendingInteractionForViewer,
    type ServerGameState
} from '../utils/gameUtils.js';
import {
    isRedisEnabled,
    saveRoomSnapshot
} from '../utils/roomStore.js';
import {
    backendLogger,
    summarizeGameState,
    summarizeWebSocketMessage
} from '../utils/runtimeLogger.js';
import {
    createDisconnectedSocket,
    createNpcSocket,
    serializeRoomSeat,
    type RoomSeat,
    type RoomSocketLike
} from '../utils/roomSession.js';
import { accountStore } from '../utils/accountStore.js';
import {
    getNpcDifficultyLabel,
    getNpcThinkingDelay,
    normalizeNpcDifficulty,
    type NpcDifficulty
} from '../npc/npcConfig.js';
import {
    buildNpcActionChoice,
    pickNpcCompetitionGroupResponse,
    pickNpcGiftCardResponse
} from '../npc/npcStrategy.js';
import {
    determineWinner,
    getNextRoundOrder,
    resolveRoundBoard
} from '../game/roundResolution.js';
import {
    buildPreparedRoundState,
    inspectRoundSetup,
    type DealSequenceStep
} from '../game/roundPreparation.js';
import {
    applyOrderConfirmation,
    applyOrderDecisionResult,
    buildConfirmationUpdate,
    buildOrderDecisionGameState,
    canStartGameWithOrder,
    choosePlayerOrder,
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import {
    getActionAvailabilityError,
    getPendingInteractionError,
    toCompetitionGroups,
    toStringArray,
    type ServerAction
} from '../game/actionValidation.js';
import {
    applySecretAction,
    applyTradeOffAction,
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from '../game/actionTransitions.js';
import {
    advanceToNextTurn,
    prepareCurrentTurn,
    revealSecretCards
} from '../game/turnLifecycle.js';
import { GEISHA_SET_CONFIG_ERROR_MESSAGE } from './roomErrors.js';
import { type RestorableRoomLike } from './roomRestore.js';

type TimerHandle = ReturnType<typeof setTimeout>;

type JsonObject = Record<string, unknown>;
type WireMessage = {
    type: string;
    payload?: unknown;
};

type PlayerMetaPayload = {
    displayName?: unknown;
    lineUserId?: unknown;
    avatarUrl?: unknown;
    accountProfile?: LineAccountProfile | null;
    roomSessionToken?: unknown;
};

type NormalizedPlayerMeta = {
    name: string;
    lineUserId?: string;
    avatarUrl?: string;
    accountProfile?: LineAccountProfile;
};

type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

type GameRoomPlayer = RoomSeat & {
    sessionToken?: string;
};

type GamePlayer = ServerGameState['players'][number];

const createRoomSessionToken = (): string => randomBytes(24).toString('hex');

const normalizeRoomSessionToken = (token: unknown): string | null => (
    typeof token === 'string' && token.trim() ? token.trim() : null
);


const normalizePlayerMeta = (playerId: string, payload: PlayerMetaPayload = {}): NormalizedPlayerMeta => {
    const displayName = typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim()
        : playerId;

    const accountProfile = payload.accountProfile && typeof payload.accountProfile === 'object'
        ? payload.accountProfile as LineAccountProfile
        : null;

    const lineUserId = typeof accountProfile?.lineUserId === 'string' && accountProfile.lineUserId.trim()
        ? accountProfile.lineUserId.trim()
        : undefined;

    const avatarUrl = typeof accountProfile?.avatarUrl === 'string' && accountProfile.avatarUrl.trim()
        ? accountProfile.avatarUrl.trim()
        : undefined;

    return {
        name: displayName,
        lineUserId,
        avatarUrl,
        accountProfile: accountProfile ?? undefined
    };
};

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

    constructor(roomId: string) {
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
    }

    // 產出可儲存的房間快照（不含連線物件）
    buildRoomSnapshot(): JsonObject {
        return {
            roomId: this.roomId,
            hostId: this.hostId,
            geishaSet: this.geishaSet,
            setupMode: this.setupMode,
            customSelection: this.customSelection,
            npcId: this.npcId,
            npcDifficulty: this.npcDifficulty,
            createdAt: this.createdAt,
            matchCompletionCounter: this.matchCompletionCounter,
            currentCompletionId: this.currentCompletionId,
            players: this.players.map(serializeRoomSeat),
            baseGeishas: this.baseGeishas,
            gameState: this.gameState
        };
    }

    // 儲存房間快照（Redis 可用時）
    persistRoomSnapshot(): void {
        if (!isRedisEnabled()) {
            return;
        }
        void saveRoomSnapshot(this.roomId, this.buildRoomSnapshot());
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

        const normalized = normalizeNpcDifficulty(difficulty);
        const label = getNpcDifficultyLabel(normalized);
        const npcId = `${label}`;
        const npcSocket = createNpcSocket();

        this.players.push({
            playerId: npcId,
            ws: npcSocket,
            isNpc: true,
            name: npcId,
            lineUserId: undefined,
            avatarUrl: undefined,
            accountProfile: undefined
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

    getPlayerMetaMap(): Record<string, { name: string; lineUserId?: string; avatarUrl?: string }> {
        return this.players.reduce<Record<string, { name: string; lineUserId?: string; avatarUrl?: string }>>((map, player) => {
            map[player.playerId] = {
                name: player.name ?? player.playerId,
                lineUserId: player.lineUserId,
                avatarUrl: player.avatarUrl
            };
            return map;
        }, {});
    }

    // 清除 NPC 計時器（避免重複執行）
    clearNpcTimers(): void {
        if (this.npcActionTimer) {
            clearTimeout(this.npcActionTimer);
            this.npcActionTimer = null;
        }
        if (this.npcResponseTimer) {
            clearTimeout(this.npcResponseTimer);
            this.npcResponseTimer = null;
        }
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
    startReadyCheck(): void {
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
            const delay = getNpcThinkingDelay(this.npcDifficulty);
            setTimeout(() => {
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

        this.players.forEach((player) => {
            this.sendToPlayer(player.playerId, {
                type: 'PENDING_INTERACTION',
                payload: sanitizePendingInteractionForViewer(pendingInteraction, player.playerId)
            });
        });
    }

    // 將遊戲狀態整理成玩家可見版本（隱藏對手手牌與密約資訊）
    buildClientGameState(viewerId: string): ServerGameState | null {
        if (!this.gameState) {
            return null;
        }

        const visibleState = buildPlayerVisibleGameState(this.gameState, viewerId, {
            geishaSet: this.geishaSet ?? DEFAULT_GEISHA_SET
        });
        if (visibleState?.geishaSet && !this.gameState.geishaSet) {
            this.gameState.geishaSet = visibleState.geishaSet;
        }
        return visibleState;
    }

    // 依玩家視角建立發牌動畫序列（開局動畫一律只顯示背面）
    buildDealSequenceForPlayer(playerId: string) {
        return this.dealSequence.map((step, index) => {
            return {
                ...step,
                card: createMaskedCard(`${playerId}-deal`, index)
            };
        });
    }

    // 加入玩家到房間，並回傳加入結果
    addPlayer(playerId: string, ws: RoomSocketLike, meta: PlayerMetaPayload = {}) {
        // 基本檢查：避免空白 playerId
        if (!playerId) {
            backendLogger.warn('⚠️ 嘗試加入房間但 playerId 為空', {
                roomId: this.roomId
            });
            return 'invalid';
        }

        const normalizedMeta = normalizePlayerMeta(playerId, meta);
        const requestedSessionToken = normalizeRoomSessionToken(meta.roomSessionToken);
        const existingPlayer = this.players.find(player => player.playerId === playerId);

        if (existingPlayer) {
            if (existingPlayer.sessionToken && requestedSessionToken !== existingPlayer.sessionToken) {
                backendLogger.warn(`⚠️ 玩家 ${playerId} 嘗試以不符 session token 重新加入房間 ${this.roomId}`, {
                    roomId: this.roomId,
                    playerId
                });
                return 'session-mismatch';
            }
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
            if (normalizedMeta.accountProfile) {
                existingPlayer.accountProfile = normalizedMeta.accountProfile;
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
            sessionToken: requestedSessionToken ?? createRoomSessionToken(),
            name: normalizedMeta.name,
            lineUserId: normalizedMeta.lineUserId,
            avatarUrl: normalizedMeta.avatarUrl,
            accountProfile: normalizedMeta.accountProfile
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
    removePlayer(playerId: string): void {
        this.players = this.players.filter(p => p.playerId !== playerId);
        backendLogger.info(`❌ 玩家 ${playerId} 離開房間 ${this.roomId}`, {
            roomId: this.roomId,
            playerId,
            playerCount: this.players.length
        });
        this.persistRoomSnapshot();
    }

    detachPlayerConnection(playerId: string, ws: RoomSocketLike | null = null) {
        const player = this.players.find(p => p.playerId === playerId);
        if (!player) {
            return false;
        }

        if (ws && player.ws !== ws) {
            return false;
        }

        player.ws = createDisconnectedSocket();
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
        const playerIds = this.players.map(p => p.playerId);

        if (playerIds.length < 2) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 嘗試準備順序決定，但玩家不足`, {
                roomId: this.roomId,
                playerCount: playerIds.length
            });
            return false;
        }

        if (!this.ensureBaseGeishas()) {
            return false;
        }
        const baseGeishas = this.baseGeishas;
        if (!baseGeishas) {
            return false;
        }

        const preparation = buildOrderDecisionGameState({
            roomId: this.roomId,
            hostId: this.hostId,
            playerIds,
            baseGeishas,
            geishaSet: this.geishaSet,
            playerMetaMap: this.getPlayerMetaMap()
        });
        if (!preparation.ok) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 無法準備順序決定`, {
                roomId: this.roomId,
                error: preparation.errorMessage
            });
            return false;
        }

        this.gameState = preparation.value;
        this.dealSequence = [];
        return true;
    }

    // 開始隨機決定順序
    startOrderDecision(): void {
        backendLogger.info(`🎲 房間 ${this.roomId} 開始隨機決定玩家順序`, {
            roomId: this.roomId
        });

        if (!this.prepareOrderDecisionState()) {
            return;
        }
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
    decideOrder(): void {
        const playerIds = this.players.map(p => p.playerId);

        const result = choosePlayerOrder(playerIds);
        if (!result) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 無法決定順序`, {
                roomId: this.roomId,
                playerCount: playerIds.length
            });
            return;
        }
        const { firstPlayer, secondPlayer } = result;
        this.orderDecisionState.result = result;

        backendLogger.info(`🎲 房間 ${this.roomId} 順序決定完成`, {
            roomId: this.roomId,
            firstPlayer: firstPlayer,
            secondPlayer: secondPlayer
        });

        const gameState = this.gameState;
        if (gameState) {
            this.gameState = applyOrderDecisionResult(gameState, result);
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
            const delay = getNpcThinkingDelay(this.npcDifficulty);
            setTimeout(() => {
                if (this.npcId) {
                    this.confirmOrder(this.npcId);
                }
            }, delay);
        }
    }

    // 處理玩家確認
    confirmOrder(playerId: string): void {
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

        const update = buildConfirmationUpdate(
            this.players.map(player => player.playerId),
            this.orderDecisionState.confirmations,
            playerId
        );
        if (!update.added) {
            backendLogger.info(`ℹ️ 玩家 ${playerId} 重複確認順序，忽略重送`, {
                roomId: this.roomId,
                playerId
            });
            return;
        }

        this.orderDecisionState.confirmations = new Set(update.confirmations);
        backendLogger.info(`✅ 玩家 ${playerId} 已確認順序`, {
            roomId: this.roomId,
            playerId,
            confirmations: this.orderDecisionState.confirmations.size
        });

        if (this.gameState) {
            this.gameState = applyOrderConfirmation(this.gameState, update);
        }

        // 廣播確認狀態
        this.broadcast({
            type: 'ORDER_CONFIRMATION_UPDATE',
            payload: {
                confirmations: update.confirmations,
                waitingFor: update.waitingFor
            }
        });

        if (this.gameState) {
            this.broadcastGameState();
        }

        // 如果所有玩家都確認了，開始遊戲
        if (update.confirmations.length === 2) {
            setTimeout(() => {
                this.startReadyCheck();
            }, 800);
        }
    }

    // 根據決定的順序開始遊戲
    startGameWithOrder(): void {
        const playerIds = this.players.map(player => player.playerId);
        const orderDecisionResult = this.orderDecisionState.result;
        if (!orderDecisionResult || !canStartGameWithOrder(
            playerIds,
            orderDecisionResult,
            this.orderDecisionState.confirmations,
            this.readyConfirmations
        )) {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 開局條件尚未完成，拒絕提前發牌`, {
                roomId: this.roomId,
                hasOrderResult: Boolean(this.orderDecisionState.result),
                confirmedOrder: Array.from(this.orderDecisionState.confirmations),
                confirmedReady: Array.from(this.readyConfirmations)
            });
            return;
        }

        const { order } = orderDecisionResult;
        if (!this.ensureBaseGeishas()) {
            return;
        }
        this.prepareRoundState({
            orderedPlayerIds: order,
            roundNumber: this.gameState?.round ?? 1,
            openOrderDecision: false
        });
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
        this.orderDecisionState = createOrderDecisionState();
        this.readyConfirmations.clear();
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
        if (!this.gameState) {
            return;
        }

        const result = prepareCurrentTurn(this.gameState);
        this.gameState = result.gameState;

        if (result.outcome.type === 'missing-player') {
            backendLogger.warn(`⚠️ 房間 ${this.roomId} 找不到當前玩家資料`, {
                roomId: this.roomId
            });
            return;
        }

        if (result.outcome.type === 'skip-player') {
            backendLogger.info(`🔄 玩家 ${result.outcome.playerId} 已無可用行動，跳到下一位`, {
                roomId: this.roomId,
                playerId: result.outcome.playerId
            });
            this.endTurn();
            return;
        }

        const currentPlayerId = result.outcome.playerId;

        // 抽牌並依玩家視角廣播
        if (result.outcome.type === 'drawn-card') {
            const drawnCard = result.outcome.card;
            this.players.forEach((player) => {
                const visibleCard = player.playerId === currentPlayerId
                    ? drawnCard
                    : createMaskedCard(`draw-${currentPlayerId}`, 0);

                this.sendToPlayer(player.playerId, {
                    type: 'CARD_DRAWN',
                    payload: {
                        playerId: currentPlayerId,
                        card: visibleCard
                    }
                });
            });
        }

        this.broadcastGameState();

        // 若輪到 NPC，安排自動行動
        if (this.isNpcPlayerId(currentPlayerId)) {
            this.scheduleNpcTurn();
        }
    }

    // 安排 NPC 行動
    scheduleNpcTurn(): void {
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

        const delay = getNpcThinkingDelay(this.npcDifficulty);
        if (this.npcActionTimer) {
            clearTimeout(this.npcActionTimer);
        }

        this.npcActionTimer = setTimeout(() => {
            this.npcActionTimer = null;
            this.performNpcAction();
        }, delay);
    }

    // 安排 NPC 回應互動（贈予/競爭）
    scheduleNpcResponse(): void {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const pending = this.gameState.pendingInteraction;
        if (!pending || pending.targetPlayerId !== this.npcId) {
            return;
        }

        const delay = getNpcThinkingDelay(this.npcDifficulty);
        if (this.npcResponseTimer) {
            clearTimeout(this.npcResponseTimer);
        }

        this.npcResponseTimer = setTimeout(() => {
            this.npcResponseTimer = null;
            this.performNpcResponse();
        }, delay);
    }

    // NPC 執行回合行動
    performNpcAction(): void {
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
    performNpcResponse(): void {
        if (!this.gameState || !this.npcId) {
            return;
        }

        const pending = this.gameState.pendingInteraction;
        if (!pending || pending.targetPlayerId !== this.npcId) {
            return;
        }

        if (pending.type === 'GIFT_SELECTION') {
            const npcPlayer = this.getPlayerState(this.npcId);
            const opponent = this.getOpponentState(this.npcId);
            const card = pickNpcGiftCardResponse(
                pending.offeredCards ?? [],
                this.npcDifficulty,
                npcPlayer,
                opponent,
                this.gameState.geishas
            );
            if (card) {
                this.handleAction(this.npcId, { type: 'RESOLVE_GIFT', payload: { chosenCardId: card.id } });
            }
            return;
        }

        if (pending.type === 'COMPETITION_SELECTION') {
            const npcPlayer = this.getPlayerState(this.npcId);
            const opponent = this.getOpponentState(this.npcId);
            const index = pickNpcCompetitionGroupResponse(
                pending.groups ?? [],
                this.npcDifficulty,
                npcPlayer,
                opponent,
                this.gameState.geishas
            );
            if (index !== null) {
                this.handleAction(this.npcId, { type: 'RESOLVE_COMPETITION', payload: { chosenGroupIndex: index } });
            }
        }
    }

    // NPC 決定要執行的行動與卡片
    buildNpcAction(player: GamePlayer): ServerAction | null {
        const opponent = this.getOpponentState(player.id);
        if (!opponent) {
            return null;
        }
        return buildNpcActionChoice(player, opponent, this.gameState?.geishas ?? [], this.npcDifficulty);
    }

    // 結束回合並切換到下一位可行動玩家
    endTurn(): void {
        if (!this.gameState) {
            return;
        }

        const result = advanceToNextTurn(this.gameState);
        this.gameState = result.gameState;

        if (result.outcome.type === 'resolve-round') {
            backendLogger.info(`🧮 房間 ${this.roomId} 所有玩家行動結束，進入結算階段`, {
                roomId: this.roomId
            });
            this.resolveRound();
            return;
        }

        this.beginTurnForCurrentPlayer();
    }

    // 結算回合（翻開密約、計算好感、檢查勝利）
    resolveRound(): void {
        if (!this.gameState) {
            return;
        }

        this.gameState.phase = 'resolution';

        this.broadcast({
            type: 'ROUND_COMPLETE',
            payload: { round: this.gameState.round }
        });

        // 翻開密約卡並加入計分區
        this.gameState.players = revealSecretCards(this.gameState.players);

        // 比較每位藝妓的卡牌數量，更新好感指示物
        const gameState = this.gameState;
        const firstPlayer = gameState.players[0];
        const secondPlayer = gameState.players[1];
        if (!firstPlayer || !secondPlayer) {
            return;
        }

        const resolution = resolveRoundBoard(gameState.geishas, gameState.players);
        gameState.geishas = resolution.geishas;
        gameState.players.forEach((player) => {
            const score = resolution.scores.get(player.id);
            if (score) {
                player.score.charm = score.charm;
                player.score.tokens = score.tokens;
            }
        });

        // 廣播結算後狀態，讓前端顯示回合結算結果
        this.broadcastGameState();

        // 檢查勝利條件
        const winner = determineWinner(this.gameState.players);
        if (winner) {
            this.gameState.phase = 'ended';
            this.gameState.winner = winner;
            if (this.gameState.removedCard) {
                this.gameState.settlement = {
                    ...(this.gameState.settlement ?? {}),
                    removedCard: this.gameState.removedCard
                };
            }
            if (!this.currentCompletionId) {
                this.matchCompletionCounter += 1;
                this.currentCompletionId = `${this.roomId}:match-${this.matchCompletionCounter}:ended`;
            }
            void accountStore.recordMatchCompletion({
                completionId: this.currentCompletionId,
                winner,
                players: this.players.map((player) => ({
                    playerId: player.playerId,
                    accountProfile: player.accountProfile
                }))
            }).catch((error) => {
                backendLogger.error('❌ Account counter update failed', {
                    roomId: this.roomId,
                    error: error instanceof Error ? error.message : 'unknown'
                });
            });

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
        if (!this.gameState) {
            return;
        }

        const nextOrder = getNextRoundOrder(this.gameState.players, this.lastRoundStarterId);
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
        const errorMessage = getPendingInteractionError(this.gameState?.pendingInteraction, actionType);
        if (errorMessage) {
            this.sendError(playerId, errorMessage);
            return false;
        }

        return true;
    }

    // 處理玩家送出的行動（入口）
    handleAction(playerId: string, action: ServerAction): void {
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
                this.handlePlaySecret(player, typeof action.payload?.cardId === 'string' ? action.payload.cardId : undefined);
                break;
            case 'PLAY_TRADE_OFF':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'trade-off')) {
                    return;
                }
                this.handleTradeOff(player, toStringArray(action.payload?.cardIds));
                break;
            case 'INITIATE_GIFT':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'gift')) {
                    return;
                }
                this.handleInitiateGift(player, toStringArray(action.payload?.cardIds));
                break;
            case 'RESOLVE_GIFT':
                this.handleResolveGift(playerId, typeof action.payload?.chosenCardId === 'string' ? action.payload.chosenCardId : undefined);
                break;
            case 'INITIATE_COMPETITION':
                if (!this.validatePlayerTurn(playerId) || !this.validateActionAvailable(player, 'competition')) {
                    return;
                }
                this.handleInitiateCompetition(player, toCompetitionGroups(action.payload?.groups));
                break;
            case 'RESOLVE_COMPETITION':
                this.handleResolveCompetition(playerId, typeof action.payload?.chosenGroupIndex === 'number' ? action.payload.chosenGroupIndex : undefined);
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
    handlePlaySecret(player: GamePlayer, cardId?: string): void {
        const result = applySecretAction(player, cardId, this.gameState?.openingDeal);
        if (!result.ok) {
            backendLogger.warn('⚠️ PLAY_SECRET 驗證失敗', {
                roomId: this.roomId,
                playerId: player.id,
                error: result.errorMessage
            });
            this.sendError(player.id, result.errorMessage);
            return;
        }

        const { player: updatedPlayer, openingDeal, revealedCardIds } = result.value;
        if (this.gameState) {
            this.gameState.players = this.gameState.players.map(item => item.id === updatedPlayer.id ? updatedPlayer : item);
            this.gameState.openingDeal = openingDeal;
            this.gameState.lastAction = { playerId: updatedPlayer.id, action: 'secret' };
        }

        this.players.forEach((recipient) => {
            const shouldReveal = recipient.playerId === updatedPlayer.id;
            this.sendToPlayer(recipient.playerId, {
                type: 'ACTION_EXECUTED',
                payload: {
                    playerId: updatedPlayer.id,
                    action: 'secret',
                    cardIds: shouldReveal ? revealedCardIds : []
                }
            });
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行取捨行動（選 2 張卡丟棄）
    handleTradeOff(player: GamePlayer, cardIds: string[] = []): void {
        const result = applyTradeOffAction(player, cardIds, this.gameState?.openingDeal);
        if (!result.ok) {
            backendLogger.warn('⚠️ PLAY_TRADE_OFF 驗證失敗', {
                roomId: this.roomId,
                playerId: player.id,
                error: result.errorMessage
            });
            this.sendError(player.id, result.errorMessage);
            return;
        }

        const { player: updatedPlayer, openingDeal, revealedCardIds } = result.value;
        if (this.gameState) {
            this.gameState.players = this.gameState.players.map(item => item.id === updatedPlayer.id ? updatedPlayer : item);
            this.gameState.openingDeal = openingDeal;
            this.gameState.lastAction = { playerId: updatedPlayer.id, action: 'trade-off' };
        }

        this.players.forEach((recipient) => {
            const shouldReveal = recipient.playerId === updatedPlayer.id;
            this.sendToPlayer(recipient.playerId, {
                type: 'ACTION_EXECUTED',
                payload: {
                    playerId: updatedPlayer.id,
                    action: 'trade-off',
                    cardIds: shouldReveal ? revealedCardIds : []
                }
            });
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行贈予行動（選 3 張卡給對手挑）
    handleInitiateGift(player: GamePlayer, cardIds: string[] = []): void {
        const opponentId = this.getOpponentId(player.id);
        const result = initiateGiftAction(player, opponentId, cardIds, this.gameState?.openingDeal);
        if (!result.ok) {
            backendLogger.warn('⚠️ INITIATE_GIFT 驗證失敗', {
                roomId: this.roomId,
                playerId: player.id,
                error: result.errorMessage
            });
            this.sendError(player.id, result.errorMessage);
            return;
        }

        if (!this.gameState) {
            return;
        }
        this.gameState.players = this.gameState.players.map(item => item.id === result.value.player.id ? result.value.player : item);
        this.gameState.openingDeal = result.value.openingDeal;
        this.gameState.pendingInteraction = result.value.pendingInteraction;
        this.gameState.lastAction = { playerId: result.value.player.id, action: 'gift' };

        this.sendPendingInteractionState();

        this.broadcastGameState();

        // 若目標是 NPC，安排自動回應
        if (this.isNpcPlayerId(result.value.pendingInteraction.targetPlayerId)) {
            this.scheduleNpcResponse();
        }
    }

    // 處理對手回應贈予（選 1 張卡）
    handleResolveGift(playerId: string, chosenCardId?: string): void {
        const result = resolveGiftAction(
            this.gameState?.players ?? [],
            this.gameState?.pendingInteraction,
            playerId,
            chosenCardId
        );
        if (!result.ok) {
            backendLogger.warn('⚠️ RESOLVE_GIFT 驗證失敗', {
                roomId: this.roomId,
                playerId,
                error: result.errorMessage
            });
            this.sendError(playerId, result.errorMessage);
            return;
        }

        if (this.gameState) {
            this.gameState.players = result.value.players;
            this.gameState.pendingInteraction = result.value.pendingInteraction;
        }

        this.broadcast({
            type: 'INTERACTION_RESOLVED',
            payload: {
                interaction: 'GIFT_SELECTION',
                initiatorId: result.value.initiatorId,
                targetPlayerId: result.value.targetPlayerId,
                chosenCardId: result.value.chosenCardId
            }
        });

        this.broadcastGameState();
        this.endTurn();
    }

    // 執行競爭行動（選 4 張卡分 2 組）
    handleInitiateCompetition(player: GamePlayer, groups: string[][] = []): void {
        const opponentId = this.getOpponentId(player.id);
        const result = initiateCompetitionAction(player, opponentId, groups, this.gameState?.openingDeal);
        if (!result.ok) {
            backendLogger.warn('⚠️ INITIATE_COMPETITION 驗證失敗', {
                roomId: this.roomId,
                playerId: player.id,
                error: result.errorMessage
            });
            this.sendError(player.id, result.errorMessage);
            return;
        }

        if (!this.gameState) {
            return;
        }
        this.gameState.players = this.gameState.players.map(item => item.id === result.value.player.id ? result.value.player : item);
        this.gameState.openingDeal = result.value.openingDeal;
        this.gameState.pendingInteraction = result.value.pendingInteraction;
        this.gameState.lastAction = { playerId: result.value.player.id, action: 'competition' };

        this.sendPendingInteractionState();

        this.broadcastGameState();

        // 若目標是 NPC，安排自動回應
        if (this.isNpcPlayerId(result.value.pendingInteraction.targetPlayerId)) {
            this.scheduleNpcResponse();
        }
    }

    // 處理對手回應競爭（選 1 組）
    handleResolveCompetition(playerId: string, chosenGroupIndex?: number): void {
        const result = resolveCompetitionAction(
            this.gameState?.players ?? [],
            this.gameState?.pendingInteraction,
            playerId,
            chosenGroupIndex
        );
        if (!result.ok) {
            backendLogger.warn('⚠️ RESOLVE_COMPETITION 驗證失敗', {
                roomId: this.roomId,
                playerId,
                error: result.errorMessage
            });
            this.sendError(playerId, result.errorMessage);
            return;
        }

        if (this.gameState) {
            this.gameState.players = result.value.players;
            this.gameState.pendingInteraction = result.value.pendingInteraction;
        }

        this.broadcast({
            type: 'INTERACTION_RESOLVED',
            payload: {
                interaction: 'COMPETITION_SELECTION',
                initiatorId: result.value.initiatorId,
                targetPlayerId: result.value.targetPlayerId,
                chosenGroupIndex: result.value.chosenGroupIndex
            }
        });

        this.broadcastGameState();
        this.endTurn();
    }
}

// 建立遮蔽卡片（避免洩漏對手手牌資訊）
function createMaskedCard(prefix: string, index: number): ItemCard {
    return {
        id: `hidden-${prefix}-${index}`,
        geishaId: 0,
        type: 'hidden'
    };
}

// 依指定長度建立遮蔽卡片陣列
function createMaskedCards(count: number, prefix: string): ItemCard[] {
    return Array.from({ length: count }, (_, index) => createMaskedCard(prefix, index));
}
