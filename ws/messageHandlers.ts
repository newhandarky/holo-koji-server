import type { WebSocket } from 'ws';
import type {
    CreateRoomPayload,
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    JoinRoomPayload,
    LineAccountProfile,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_ROOM_SETUP_MODE,
    createWaitingGameState,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode,
    type PlayerMetaMap,
    type ServerGameState
} from '../utils/gameUtils.js';
import type { RoomSeat, RoomSocketLike } from '../utils/roomSession.js';
import type {
    RestorableRoomLike,
    RestorableRoomSnapshot
} from '../rooms/roomRestore.js';
import {
    normalizeCustomSelection,
    restoreRoomFromSnapshot
} from '../rooms/roomRestore.js';
import {
    CUSTOM_SELECTION_ERROR_MESSAGE,
    GEISHA_SET_CONFIG_ERROR_MESSAGE,
    LEGACY_GEISHA_SET_ERROR_MESSAGE,
    PLAYER_ID_TAKEN_ERROR_MESSAGE
} from '../rooms/roomErrors.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { WebSocketConnectionContext } from './connectionContext.js';

type JsonObject = Record<string, unknown>;

type GameActionPayload = {
    type?: unknown;
    actionType?: unknown;
    action?: unknown;
    cards?: unknown;
    cardIds?: unknown;
    cardId?: unknown;
    chosenCardId?: unknown;
    chosenGroupIndex?: unknown;
    groups?: unknown;
};

type ServerAction = {
    type: string;
    payload?: GameActionPayload;
};

type PlayerMetaPayload = {
    displayName?: unknown;
    lineUserId?: unknown;
    avatarUrl?: unknown;
    accountProfile?: LineAccountProfile | null;
    roomSessionToken?: unknown;
};

type AddPlayerResult = 'invalid' | 'existing' | 'full' | 'session-mismatch' | 'added';

export interface WebSocketRoomLike extends RestorableRoomLike {
    players: Array<RoomSeat & { sessionToken?: string }>;
    maxPlayers: number;
    hostId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    baseGeishas: Geisha[] | null;
    gameState: ServerGameState | null;
    regenerateBaseGeishas: () => boolean;
    addPlayer: (playerId: string, ws: RoomSocketLike, meta?: PlayerMetaPayload) => AddPlayerResult;
    addNpcPlayer: (difficulty?: unknown) => string | null;
    getPlayerMetaMap: () => PlayerMetaMap;
    broadcastGameState: () => void;
    persistRoomSnapshot: () => void;
    ensureBaseGeishas: () => boolean;
    buildClientGameState: (viewerId: string) => ServerGameState | null;
    startOrderDecision: () => void;
    confirmOrder: (playerId: string) => void;
    handleAction: (playerId: string, action: ServerAction) => void;
    sendError: (playerId: string, message: string, code?: string) => void;
    confirmReady: (playerId: string) => void;
    requestRematch: (playerId: string) => void;
    detachPlayerConnection: (playerId: string, ws?: RoomSocketLike | null) => boolean;
    removePlayer: (playerId: string) => void;
    broadcast: (message: { type: string; payload?: unknown }) => void;
}

export interface MessageHandlerDependencies<TRoom extends WebSocketRoomLike> {
    rooms: Map<string, TRoom>;
    createRoom: (roomId: string) => TRoom;
    loadRoomSnapshot: <TSnapshot = unknown>(roomId: string) => Promise<TSnapshot | null>;
    deleteRoomSnapshot: (roomId: string) => Promise<void>;
}

const normalizeNpcDifficulty = (difficulty: unknown): 'easy' | 'medium' | 'hard' | 'expert' | 'hell' => {
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' || difficulty === 'expert' || difficulty === 'hell') {
        return difficulty;
    }
    return 'easy';
};

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const generateRoomId = (): string => Math.random().toString(36).substring(2, 8).toUpperCase();

export const handleCreateRoom = async <TRoom extends WebSocketRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): Promise<void> => {
    if (!isRecord(payload) || typeof payload.playerId !== 'string' || !payload.playerId) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: '缺少 playerId' }
        }));
        return;
    }
    const createPayload = payload as Partial<CreateRoomPayload> & PlayerMetaPayload;

    const mode = createPayload.mode === 'npc' ? 'npc' : 'online';
    const aiDifficulty = normalizeNpcDifficulty(createPayload.aiDifficulty ?? 'easy');
    const requestedGeishaSet = normalizeGeishaSet(createPayload.geishaSet);
    let setupMode = DEFAULT_ROOM_SETUP_MODE;
    if (!isSupportedGeishaSet(requestedGeishaSet)) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: LEGACY_GEISHA_SET_ERROR_MESSAGE }
        }));
        return;
    }
    try {
        setupMode = normalizeRoomSetupMode(createPayload.setupMode);
    } catch (_error) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: CUSTOM_SELECTION_ERROR_MESSAGE }
        }));
        return;
    }

    const roomId = generateRoomId();
    const room = deps.createRoom(roomId);
    deps.rooms.set(roomId, room);

    context.currentPlayerId = payload.playerId;
    context.currentRoomId = roomId;
    room.hostId = context.currentPlayerId;
    room.geishaSet = requestedGeishaSet as GeishaSet;
    room.setupMode = setupMode;
    room.customSelection = setupMode === 'custom'
        ? normalizeCustomSelection(createPayload.customSelection)
        : null;
    if (!room.regenerateBaseGeishas()) {
        deps.rooms.delete(roomId);
        context.currentRoomId = null;
        context.currentPlayerId = null;
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: setupMode === 'custom' ? CUSTOM_SELECTION_ERROR_MESSAGE : GEISHA_SET_CONFIG_ERROR_MESSAGE }
        }));
        return;
    }
    room.customSelection = setupMode === 'custom'
        ? normalizeCustomSelection(room.customSelection)
        : null;
    if (setupMode === 'custom' && !room.customSelection) {
        deps.rooms.delete(roomId);
        context.currentRoomId = null;
        context.currentPlayerId = null;
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: CUSTOM_SELECTION_ERROR_MESSAGE }
        }));
        return;
    }

    room.addPlayer(context.currentPlayerId, ws, {
        ...createPayload,
        accountProfile: context.currentAccountProfile
    });
    const hostSeat = room.players.find((player) => player.playerId === context.currentPlayerId);

    if (mode === 'npc') {
        room.addNpcPlayer(aiDifficulty);
    }

    backendLogger.info(`🏠 房間 ${roomId} 已建立`, {
        roomId,
        playerId: context.currentPlayerId,
        mode,
        geishaSet: requestedGeishaSet,
        setupMode,
        origin: context.origin
    });

    ws.send(JSON.stringify({
        type: 'ROOM_CREATED',
        payload: {
            roomId,
            playerId: context.currentPlayerId,
            roomSessionToken: hostSeat?.sessionToken
        }
    }));

    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: GEISHA_SET_CONFIG_ERROR_MESSAGE }
        }));
        return;
    }
    const initialGameState = createWaitingGameState(
        roomId,
        room.players.map(p => p.playerId),
        baseGeishas,
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
};

export const handleJoinRoom = async <TRoom extends WebSocketRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): Promise<void> => {
    if (!isRecord(payload) || typeof payload.roomId !== 'string' || typeof payload.playerId !== 'string' || !payload.roomId || !payload.playerId) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: '缺少 roomId 或 playerId', code: 'INVALID_JOIN_REQUEST' }
        }));
        return;
    }

    const joinPayload = payload as Partial<JoinRoomPayload> & PlayerMetaPayload;
    const { roomId, playerId } = payload;
    let room = deps.rooms.get(roomId);

    if (!room) {
        const snapshot = await deps.loadRoomSnapshot<RestorableRoomSnapshot>(roomId);
        if (snapshot) {
            const restoreResult = restoreRoomFromSnapshot(snapshot, {
                createRoom: (restoredRoomId) => deps.createRoom(restoredRoomId)
            });
            room = restoreResult.room ?? undefined;
            if (room) {
                deps.rooms.set(roomId, room);
            } else if (restoreResult.errorMessage) {
                ws.send(JSON.stringify({
                    type: 'ERROR',
                    payload: { message: restoreResult.errorMessage, code: 'ROOM_RESTORE_FAILED' }
                }));
                return;
            }
        }
    }

    if (!room) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: '房間不存在', code: 'ROOM_NOT_FOUND' }
        }));
        return;
    }
    if (!room.ensureBaseGeishas()) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: GEISHA_SET_CONFIG_ERROR_MESSAGE, code: 'ROOM_CONFIG_INVALID' }
        }));
        return;
    }
    const isExistingPlayer = room.players.some(player => player.playerId === playerId);
    if (!isExistingPlayer && room.gameState?.phase && room.gameState.phase !== 'waiting') {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: '房間已開始對局', code: 'ROOM_ALREADY_STARTED' }
        }));
        return;
    }
    const result = room.addPlayer(playerId, ws, {
        ...joinPayload,
        roomSessionToken: joinPayload.roomSessionToken,
        accountProfile: context.currentAccountProfile
    });

    if (result === 'session-mismatch') {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: PLAYER_ID_TAKEN_ERROR_MESSAGE, code: 'PLAYER_ID_TAKEN' }
        }));
        return;
    }

    if (result === 'full') {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: '房間已滿', code: 'ROOM_FULL' }
        }));
        return;
    }

    context.currentPlayerId = playerId;
    context.currentRoomId = roomId;

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
        origin: context.origin
    });

    ws.send(JSON.stringify({
        type: 'PLAYER_JOINED',
        payload: {
            playerId,
            roomId,
            roomSessionToken: room.players.find((player) => player.playerId === playerId)?.sessionToken
        }
    }));

    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { message: GEISHA_SET_CONFIG_ERROR_MESSAGE, code: 'ROOM_CONFIG_INVALID' }
        }));
        return;
    }
    const updatedGameState = createWaitingGameState(
        roomId,
        room.players.map(p => p.playerId),
        baseGeishas,
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
};

export const handleConfirmOrder = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    const room = deps.rooms.get(context.currentRoomId);
    if (!room) {
        return;
    }
    room.confirmOrder(context.currentPlayerId);
};

export const handleGameAction = <TRoom extends WebSocketRoomLike>(
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    const room = deps.rooms.get(context.currentRoomId);
    if (!room) {
        return;
    }

    if (!isRecord(payload) || !isRecord(payload.action) || typeof payload.action.type !== 'string') {
        backendLogger.warn('⚠️ GAME_ACTION 缺少 action 內容', {
            roomId: context.currentRoomId ?? undefined,
            playerId: context.currentPlayerId ?? undefined
        });
        room.sendError(context.currentPlayerId, '缺少行動內容');
        return;
    }

    const actionPayload = isRecord(payload.action.payload)
        ? payload.action.payload as GameActionPayload
        : undefined;
    room.handleAction(context.currentPlayerId, {
        type: payload.action.type,
        ...(actionPayload ? { payload: actionPayload } : {})
    });
};

export const handleReadyConfirm = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    const room = deps.rooms.get(context.currentRoomId);
    if (!room) {
        return;
    }

    room.confirmReady(context.currentPlayerId);
};

export const handleRematchRequest = <TRoom extends WebSocketRoomLike>(
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (!context.currentRoomId || !context.currentPlayerId) {
        return;
    }
    const room = deps.rooms.get(context.currentRoomId);
    if (!room) {
        return;
    }

    room.requestRematch(context.currentPlayerId);
};

export const handleLeaveRoom = <TRoom extends WebSocketRoomLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: MessageHandlerDependencies<TRoom>
): void => {
    if (context.currentRoomId && context.currentPlayerId) {
        const room = deps.rooms.get(context.currentRoomId);
        if (room) {
            const shouldDetachOnly = room.gameState?.phase && room.gameState.phase !== 'waiting';
            if (shouldDetachOnly) {
                room.detachPlayerConnection(context.currentPlayerId, ws);
            } else {
                room.removePlayer(context.currentPlayerId);
                room.broadcast({
                    type: 'PLAYER_LEFT',
                    payload: { playerId: context.currentPlayerId }
                });

                const firstSeat = room.players[0];
                const hasOnlyNpc = room.players.length === 1 && room.npcId && firstSeat?.playerId === room.npcId;
                if (room.players.length === 0 || hasOnlyNpc) {
                    deps.rooms.delete(context.currentRoomId);
                    void deps.deleteRoomSnapshot(context.currentRoomId);
                    backendLogger.info(`🗑️ 房間 ${context.currentRoomId} 已刪除`, {
                        roomId: context.currentRoomId
                    });
                }
            }
        }
    }
    context.currentRoomId = null;
    context.currentPlayerId = null;
};
