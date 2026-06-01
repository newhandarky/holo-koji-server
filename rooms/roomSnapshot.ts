import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../utils/gameUtils.js';
import {
    isRedisEnabled,
    saveRoomSnapshot
} from '../utils/roomStore.js';
import {
    serializeRoomSeat,
    type RoomSeat,
    type SerializedRoomSeat
} from '../utils/roomSession.js';

export type SnapshotNpcDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'hell';

export type RoomSnapshotSource = {
    roomId: string;
    hostId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    npcId: string | null;
    npcDifficulty: SnapshotNpcDifficulty | null;
    createdAt: number;
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    players: readonly RoomSeat[];
    baseGeishas: Geisha[] | null;
    gameState: ServerGameState | null;
};

export type RoomSnapshot = {
    roomId: string;
    hostId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    npcId: string | null;
    npcDifficulty: SnapshotNpcDifficulty | null;
    createdAt: number;
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    players: SerializedRoomSeat[];
    baseGeishas: readonly Geisha[] | null;
    gameState: ServerGameState | null;
};

export type RestorableRoomSnapshot = Partial<RoomSnapshot> & {
    matchCompletionCounter?: unknown;
    currentCompletionId?: unknown;
    gameState?: Partial<ServerGameState> | null;
};

type RoomSnapshotPersistenceDependencies = {
    isPersistenceEnabled?: () => boolean;
    saveSnapshot?: (roomId: string, snapshot: RoomSnapshot) => Promise<void>;
};

export const buildRoomSnapshot = (source: RoomSnapshotSource): RoomSnapshot => ({
    roomId: source.roomId,
    hostId: source.hostId,
    geishaSet: source.geishaSet,
    setupMode: source.setupMode,
    customSelection: source.customSelection,
    npcId: source.npcId,
    npcDifficulty: source.npcDifficulty,
    createdAt: source.createdAt,
    matchCompletionCounter: source.matchCompletionCounter,
    currentCompletionId: source.currentCompletionId,
    players: source.players.map(serializeRoomSeat),
    baseGeishas: source.baseGeishas ? [...source.baseGeishas] : null,
    gameState: source.gameState
});

export const persistRoomSnapshot = (
    source: RoomSnapshotSource,
    {
        isPersistenceEnabled = isRedisEnabled,
        saveSnapshot = saveRoomSnapshot
    }: RoomSnapshotPersistenceDependencies = {}
): void => {
    if (!isPersistenceEnabled()) {
        return;
    }

    void saveSnapshot(source.roomId, buildRoomSnapshot(source));
};
