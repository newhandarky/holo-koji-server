import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE
} from '../game/geishaSetCatalog.js';
import {
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import type { RoomSeat } from '../utils/roomSession.js';
import {
    roomScheduler,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';
import type { DealSequenceStep } from '../game/roundPreparation.js';
import type { NpcDifficulty } from '../npc/npcConfig.js';

type GamePlayer = ServerGameState['players'][number];
type RoomPlayerRef = {
    playerId: string;
};

export type InitialRoomState = {
    roomId: string;
    createdAt: number;
    players: RoomSeat[];
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
};

export const createInitialRoomState = (
    roomId: string,
    scheduler: RoomScheduler = roomScheduler
): InitialRoomState => ({
    roomId,
    createdAt: Date.now(),
    players: [],
    gameState: null,
    maxPlayers: 2,
    hostId: null,
    geishaSet: DEFAULT_GEISHA_SET,
    setupMode: DEFAULT_ROOM_SETUP_MODE,
    customSelection: null,
    orderDecisionState: createOrderDecisionState(),
    baseGeishas: null,
    dealSequence: [],
    lastRoundStarterId: null,
    roundResolveTimer: null,
    npcId: null,
    npcDifficulty: null,
    npcActionTimer: null,
    npcResponseTimer: null,
    rematchConfirmations: new Set(),
    readyConfirmations: new Set(),
    matchCompletionCounter: 0,
    currentCompletionId: null,
    scheduler
});

export const isRoomNpcPlayerId = (
    room: Pick<InitialRoomState, 'npcId'>,
    playerId: string
): boolean => Boolean(room.npcId) && playerId === room.npcId;

export const getRoomPlayerState = (
    room: Pick<InitialRoomState, 'gameState'>,
    playerId: string
): GamePlayer | null => room.gameState?.players.find(player => player.id === playerId) ?? null;

export const getRoomOpponentId = (
    room: { players: RoomPlayerRef[] },
    playerId: string
): string | null => (
    room.players
        .map(player => player.playerId)
        .find(id => id !== playerId) ?? null
);

export const getRoomOpponentState = (
    room: { players: RoomPlayerRef[]; gameState: ServerGameState | null },
    playerId: string
): GamePlayer | null => {
    const opponentId = getRoomOpponentId(room, playerId);
    return opponentId ? getRoomPlayerState(room, opponentId) : null;
};
