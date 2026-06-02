import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import type { ServerAction } from '../game/actionValidation.js';
import type {
    AddPlayerResult,
    PlayerMetaPayload
} from '../rooms/roomMembership.js';
import type { RestorableRoomLike } from '../rooms/roomRestore.js';
import type { RoomScheduler } from '../rooms/roomScheduler.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../utils/gameUtils.js';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';

export interface RoomMessageHandlerLike {
    confirmOrder: (playerId: string) => void;
    handleAction: (playerId: string, action: ServerAction) => void;
    sendError: (playerId: string, message: string, code?: string) => void;
    confirmReady: (playerId: string) => void;
    requestRematch: (playerId: string) => void;
}

export interface RoomLifecycleHandlerLike extends RestorableRoomLike {
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
    detachPlayerConnection: (playerId: string, ws?: RoomSocketLike | null) => boolean;
    removePlayer: (playerId: string, ws?: RoomSocketLike | null) => boolean;
    broadcast: (message: { type: string; payload?: unknown }) => void;
}

export type WebSocketRoomLike = RoomMessageHandlerLike & RoomLifecycleHandlerLike;

export interface MessageHandlerDependencies<TRoom extends RoomMessageHandlerLike> {
    rooms: Map<string, TRoom>;
}

export interface RoomLifecycleHandlerDependencies<TRoom extends RoomLifecycleHandlerLike> {
    rooms: Map<string, TRoom>;
    createRoom: (roomId: string) => TRoom;
    loadRoomSnapshot: <TSnapshot = unknown>(roomId: string) => Promise<TSnapshot | null>;
    deleteRoomSnapshot: (roomId: string) => Promise<void>;
    scheduler?: RoomScheduler;
}
