import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    normalizeRoomSetupMode,
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    type ServerGameState
} from '../utils/gameUtils.js';
import {
    buildRestoredRoomSeats,
    createNpcSocket,
    type RoomSeat
} from '../utils/roomSession.js';
import { LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE } from './roomErrors.js';
import type {
    RestorableRoomSnapshot,
    SnapshotNpcDifficulty
} from './roomSnapshot.js';

type JsonObject = Record<string, unknown>;

export type { RestorableRoomSnapshot } from './roomSnapshot.js';

export interface RestorableRoomLike {
    hostId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    npcId: string | null;
    npcDifficulty: SnapshotNpcDifficulty | null;
    createdAt: number;
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    baseGeishas: Geisha[] | null;
    gameState: ServerGameState | null;
    players: RoomSeat[];
}

export interface RestoreRoomDependencies<TRoom extends RestorableRoomLike> {
    createRoom: (roomId: string) => TRoom;
}

export type RestoredRoomResult<TRoom extends RestorableRoomLike> = {
    room: TRoom | null;
    errorMessage: string | null;
};

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const normalizeCustomSelection = (value: unknown): CustomCharacterSelection | null => (
    isRecord(value) && Array.isArray(value.characterIds)
        ? { characterIds: value.characterIds.filter((item): item is string => typeof item === 'string') }
        : null
);

export const restoreRoomFromSnapshot = <TRoom extends RestorableRoomLike>(
    snapshot: RestorableRoomSnapshot | null,
    deps: RestoreRoomDependencies<TRoom>
): RestoredRoomResult<TRoom> => {
    if (!snapshot?.roomId) {
        return { room: null, errorMessage: LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE };
    }

    let snapshotGeishaSet: GeishaSet = DEFAULT_GEISHA_SET;
    let resolvedBoard: Geisha[] | null = null;
    try {
        const boardSnapshot = {
            ...snapshot,
            customSelection: snapshot.customSelection ?? undefined,
            baseGeishas: snapshot.baseGeishas ? [...snapshot.baseGeishas] : undefined,
            gameState: snapshot.gameState ?? undefined
        };
        snapshotGeishaSet = resolveRestorableGeishaSet(boardSnapshot) as GeishaSet;
        resolvedBoard = resolveRestorableBoardForSet(boardSnapshot, snapshotGeishaSet);
    } catch (_error) {
        return { room: null, errorMessage: LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE };
    }

    const room = deps.createRoom(snapshot.roomId);
    room.hostId = snapshot.hostId ?? null;
    room.geishaSet = snapshotGeishaSet;
    room.setupMode = normalizeRoomSetupMode(snapshot.setupMode ?? snapshot.gameState?.setupMode);
    const restoredCustomSelection = normalizeCustomSelection(snapshot.customSelection ?? snapshot.gameState?.customSelection);
    room.customSelection = room.setupMode === 'custom'
        ? restoredCustomSelection
        : null;
    room.npcId = snapshot.npcId ?? null;
    room.npcDifficulty = snapshot.npcDifficulty ?? null;
    room.createdAt = typeof snapshot.createdAt === 'number' && Number.isSafeInteger(snapshot.createdAt)
        ? snapshot.createdAt
        : Date.now();
    room.matchCompletionCounter = typeof snapshot.matchCompletionCounter === 'number' && Number.isSafeInteger(snapshot.matchCompletionCounter)
        ? snapshot.matchCompletionCounter
        : 0;
    room.currentCompletionId = typeof snapshot.currentCompletionId === 'string'
        ? snapshot.currentCompletionId
        : null;
    room.baseGeishas = resolvedBoard;
    room.gameState = snapshot.gameState as ServerGameState | null ?? null;

    room.players = buildRestoredRoomSeats(snapshot as Parameters<typeof buildRestoredRoomSeats>[0]);
    if (room.npcId) {
        const npcSeat = room.players.find((player) => player.playerId === room.npcId);
        if (npcSeat) {
            npcSeat.isNpc = true;
            npcSeat.ws = createNpcSocket();
        } else {
            room.players.push({ playerId: room.npcId, ws: createNpcSocket(), isNpc: true, name: room.npcId });
        }
    }

    if (room.gameState) {
        room.gameState.geishaSet = snapshotGeishaSet;
    }

    return { room, errorMessage: null };
};
