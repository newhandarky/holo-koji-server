import type { WebSocket } from 'ws';
import type { GeishaSet } from '@newhandarky/hanakoji-game-types';
import { createWaitingGameState } from '../game/serverGameStateFactory.js';
import type { RestorableRoomSnapshot } from '../rooms/roomRestore.js';
import {
    normalizeCustomSelection,
    restoreRoomFromSnapshot
} from '../rooms/roomRestore.js';
import {
    CUSTOM_SELECTION_ERROR_MESSAGE,
    GEISHA_SET_CONFIG_ERROR_MESSAGE,
    PLAYER_ID_TAKEN_ERROR_MESSAGE
} from '../rooms/roomErrors.js';
import { roomScheduler } from '../rooms/roomScheduler.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { WebSocketConnectionContext } from './connectionContext.js';
import type {
    RoomLifecycleHandlerDependencies,
    RoomLifecycleHandlerLike
} from './roomHandlerTypes.js';
import type {
    ParsedCreateRoomPayload,
    ParsedJoinRoomPayload
} from './roomLifecyclePayloads.js';
import {
    sendGameStateUpdated,
    sendLifecycleError,
    sendPlayerJoined,
    sendRoomCreated
} from './roomLifecycleResponses.js';

const generateRoomId = (): string => Math.random().toString(36).substring(2, 8).toUpperCase();

export const createRoomFromLifecyclePayload = async <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>,
    payload: ParsedCreateRoomPayload
): Promise<void> => {
    const {
        rawPayload: createPayload,
        playerId,
        mode,
        aiDifficulty,
        requestedGeishaSet,
        setupMode
    } = payload;

    const roomId = generateRoomId();
    const room = deps.createRoom(roomId);
    deps.rooms.set(roomId, room);
    context.currentPlayerId = playerId;
    context.currentRoomId = roomId;
    room.hostId = context.currentPlayerId;
    room.geishaSet = requestedGeishaSet as GeishaSet;
    room.setupMode = setupMode;
    room.customSelection = setupMode === 'custom' ? normalizeCustomSelection(createPayload.customSelection) : null;
    if (!room.regenerateBaseGeishas()) {
        deps.rooms.delete(roomId);
        context.currentRoomId = null;
        context.currentPlayerId = null;
        sendLifecycleError(ws, setupMode === 'custom' ? CUSTOM_SELECTION_ERROR_MESSAGE : GEISHA_SET_CONFIG_ERROR_MESSAGE);
        return;
    }
    room.customSelection = setupMode === 'custom' ? normalizeCustomSelection(room.customSelection) : null;
    if (setupMode === 'custom' && !room.customSelection) {
        deps.rooms.delete(roomId);
        context.currentRoomId = null;
        context.currentPlayerId = null;
        sendLifecycleError(ws, CUSTOM_SELECTION_ERROR_MESSAGE);
        return;
    }

    room.addPlayer(context.currentPlayerId, ws, { ...createPayload, accountProfile: context.currentAccountProfile });
    const hostSeat = room.players.find(player => player.playerId === context.currentPlayerId);
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
    sendRoomCreated(ws, roomId, context.currentPlayerId, hostSeat?.sessionToken);

    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        sendLifecycleError(ws, GEISHA_SET_CONFIG_ERROR_MESSAGE);
        return;
    }
    const initialGameState = createWaitingGameState(
        roomId,
        room.players.map(player => player.playerId),
        baseGeishas,
        room.geishaSet,
        room.getPlayerMetaMap()
    );
    initialGameState.hostId = room.hostId;
    room.gameState = initialGameState;
    room.broadcastGameState();
    room.persistRoomSnapshot();

    if (room.players.length === room.maxPlayers) {
        backendLogger.info(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`, { roomId });
        (deps.scheduler ?? roomScheduler).setTimeout(() => {
            room.startOrderDecision();
        }, 800);
    }
};

export const joinRoomFromLifecyclePayload = async <TRoom extends RoomLifecycleHandlerLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: RoomLifecycleHandlerDependencies<TRoom>,
    payload: ParsedJoinRoomPayload
): Promise<void> => {
    const {
        rawPayload: joinPayload,
        roomId,
        playerId
    } = payload;
    let room = deps.rooms.get(roomId);
    if (!room) {
        const snapshot = await deps.loadRoomSnapshot<RestorableRoomSnapshot>(roomId);
        if (snapshot) {
            const restoreResult = restoreRoomFromSnapshot(snapshot, {
                createRoom: restoredRoomId => deps.createRoom(restoredRoomId)
            });
            room = restoreResult.room ?? undefined;
            if (room) {
                deps.rooms.set(roomId, room);
            } else if (restoreResult.errorMessage) {
                sendLifecycleError(ws, restoreResult.errorMessage, 'ROOM_RESTORE_FAILED');
                return;
            }
        }
    }
    if (!room) {
        sendLifecycleError(ws, '房間不存在', 'ROOM_NOT_FOUND');
        return;
    }
    if (!room.ensureBaseGeishas()) {
        sendLifecycleError(ws, GEISHA_SET_CONFIG_ERROR_MESSAGE, 'ROOM_CONFIG_INVALID');
        return;
    }
    const isExistingPlayer = room.players.some(player => player.playerId === playerId);
    if (!isExistingPlayer && room.gameState?.phase && room.gameState.phase !== 'waiting') {
        sendLifecycleError(ws, '房間已開始對局', 'ROOM_ALREADY_STARTED');
        return;
    }
    const result = room.addPlayer(playerId, ws, {
        ...joinPayload,
        roomSessionToken: joinPayload.roomSessionToken,
        accountProfile: context.currentAccountProfile
    });
    if (result === 'session-mismatch') {
        sendLifecycleError(ws, PLAYER_ID_TAKEN_ERROR_MESSAGE, 'PLAYER_ID_TAKEN');
        return;
    }
    if (result === 'full') {
        sendLifecycleError(ws, '房間已滿', 'ROOM_FULL');
        return;
    }

    context.currentPlayerId = playerId;
    context.currentRoomId = roomId;
    if (result === 'existing') {
        backendLogger.info(`♻️ 玩家 ${playerId} 已在房間 ${roomId}，同步當前狀態`, { roomId, playerId });
        if (room.gameState) {
            sendGameStateUpdated(ws, room.buildClientGameState(playerId));
        }
        return;
    }
    backendLogger.info(`👤 玩家 ${playerId} 加入房間 ${roomId}`, {
        roomId,
        playerId,
        geishaSet: room.geishaSet,
        origin: context.origin
    });
    sendPlayerJoined(ws, roomId, playerId, room.players.find(player => player.playerId === playerId)?.sessionToken);

    const baseGeishas = room.baseGeishas;
    if (!baseGeishas) {
        sendLifecycleError(ws, GEISHA_SET_CONFIG_ERROR_MESSAGE, 'ROOM_CONFIG_INVALID');
        return;
    }
    const updatedGameState = createWaitingGameState(
        roomId,
        room.players.map(player => player.playerId),
        baseGeishas,
        room.geishaSet,
        room.getPlayerMetaMap()
    );
    updatedGameState.hostId = room.hostId;
    room.gameState = updatedGameState;
    room.broadcastGameState();
    room.persistRoomSnapshot();

    if (room.players.length === room.maxPlayers) {
        backendLogger.info(`🎮 房間 ${roomId} 已滿，開始隨機決定順序`, { roomId });
        (deps.scheduler ?? roomScheduler).setTimeout(() => {
            room.startOrderDecision();
        }, 1000);
    }
};
