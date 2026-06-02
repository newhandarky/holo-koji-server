import { backendLogger } from '../utils/runtimeLogger.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../game/serverGameStateTypes.js';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';
import {
    addRoomPlayer,
    buildPlayerMetaMap,
    detachRoomPlayer,
    removeRoomPlayer,
    type AddPlayerResult,
    type PlayerMetaPayload
} from './roomMembership.js';

export type RoomSeatRuntime = {
    roomId: string;
    players: RoomSeat[];
    maxPlayers: number;
    gameState: Pick<ServerGameState, 'phase'> | null;
    persistRoomSnapshot: () => void;
};

export const getRoomPlayerMetaMap = (room: Pick<RoomSeatRuntime, 'players'>): PlayerMetaMap => (
    buildPlayerMetaMap(room.players)
);

export const addRoomSeat = (
    room: RoomSeatRuntime,
    playerId: string,
    ws: RoomSocketLike,
    meta: PlayerMetaPayload = {}
): AddPlayerResult => {
    const update = addRoomPlayer(room.players, room.maxPlayers, playerId, ws, meta);
    if (update.result === 'invalid') {
        backendLogger.warn('⚠️ 嘗試加入房間但 playerId 為空', {
            roomId: room.roomId
        });
        return 'invalid';
    }

    if (update.result === 'session-mismatch') {
        backendLogger.warn(`⚠️ 玩家 ${playerId} 嘗試以不符 session token 重新加入房間 ${room.roomId}`, {
            roomId: room.roomId,
            playerId
        });
        return 'session-mismatch';
    }

    if (update.result === 'existing') {
        room.players = update.seats;
        backendLogger.info(`♻️ 玩家 ${playerId} 重新連線房間 ${room.roomId}`, {
            roomId: room.roomId,
            playerId
        });
        room.persistRoomSnapshot();
        return 'existing';
    }

    if (update.result === 'full') {
        return 'full';
    }

    room.players = update.seats;
    backendLogger.info(`✅ 玩家 ${playerId} 加入房間 ${room.roomId}`, {
        roomId: room.roomId,
        playerId,
        playerCount: room.players.length
    });
    room.persistRoomSnapshot();
    return 'added';
};

export const removeRoomSeat = (
    room: RoomSeatRuntime,
    playerId: string,
    ws: RoomSocketLike | null = null
): boolean => {
    const nextPlayers = removeRoomPlayer(room.players, playerId, ws);
    if (nextPlayers.length === room.players.length) {
        return false;
    }

    room.players = nextPlayers;
    backendLogger.info(`❌ 玩家 ${playerId} 離開房間 ${room.roomId}`, {
        roomId: room.roomId,
        playerId,
        playerCount: room.players.length
    });
    room.persistRoomSnapshot();
    return true;
};

export const detachRoomSeatConnection = (
    room: RoomSeatRuntime,
    playerId: string,
    ws: RoomSocketLike | null = null
): boolean => {
    const update = detachRoomPlayer(room.players, playerId, ws);
    if (!update.detached) {
        return false;
    }

    room.players = update.seats;
    backendLogger.info(`🔌 玩家 ${playerId} 已斷線但保留房間座位`, {
        roomId: room.roomId,
        playerId,
        phase: room.gameState?.phase
    });
    room.persistRoomSnapshot();
    return true;
};

export const isRoomFull = (room: Pick<RoomSeatRuntime, 'players' | 'maxPlayers'>): boolean => (
    room.players.length === room.maxPlayers
);
