import {
    type Geisha,
    type GeishaSet
} from '@newhandarky/hanakoji-game-types';
import { type OrderDecisionState } from '../game/openingFlow.js';
import { type NpcDifficulty } from '../npc/npcConfig.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../game/serverGameStateTypes.js';
import type { RoomScheduler } from './roomScheduler.js';
import type { RoomSeat } from '../utils/roomSession.js';
import type { WireMessage } from './roomMessaging.js';

type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

export type RoomOpeningRuntime = {
    roomId: string;
    hostId: string | null;
    players: RoomSeat[];
    gameState: ServerGameState | null;
    baseGeishas: Geisha[] | null;
    geishaSet: GeishaSet;
    orderDecisionState: OrderDecisionState;
    readyConfirmations: Set<string>;
    dealSequence: unknown[];
    lastRoundStarterId: string | null;
    npcId: string | null;
    npcDifficulty: NpcDifficulty | null;
    scheduler: RoomScheduler;
    ensureBaseGeishas: () => boolean;
    getPlayerMetaMap: () => PlayerMetaMap;
    validatePlayerInRoom: (playerId: string) => boolean;
    sendError: (playerId: string, message: string, code?: string) => void;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    broadcastGameState: () => void;
    broadcastGameStateEvent: (eventType: string) => void;
    prepareRoundState: (options?: RoundPreparationOptions) => void;
    buildDealSequenceForPlayer: (playerId: string) => unknown;
    beginTurnForCurrentPlayer: () => void;
    startReadyCheck: () => void;
    startGameWithOrder: () => void;
    confirmOrder: (playerId: string) => void;
};

export {
    prepareRoomOrderDecisionState,
    startRoomOrderDecision,
    decideRoomOrder,
    confirmRoomOrder
} from './roomOrderDecisionRuntime.js';

export { startRoomGameWithOrder } from './roomOpeningStartRuntime.js';
