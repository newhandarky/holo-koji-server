import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';
import type { RoomSeat } from '../utils/roomSession.js';
import type { WireMessage } from './roomMessaging.js';

type RoundPreparationOptions = {
    orderedPlayerIds?: string[] | null;
    roundNumber?: number | null;
    openOrderDecision?: boolean;
};

export type RoomTurnRoundRuntime = {
    roomId: string;
    gameState: ServerGameState | null;
    players: RoomSeat[];
    scheduler: RoomScheduler;
    roundResolveTimer: TimerHandle | null;
    lastRoundStarterId: string | null;
    baseGeishas: ServerGameState['geishas'] | null;
    dealSequence: unknown[];
    matchCompletionCounter: number;
    currentCompletionId: string | null;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    broadcastGameState: () => void;
    beginTurnForCurrentPlayer: () => void;
    endTurn: () => void;
    resolveRound: () => void;
    startNextRound: () => void;
    scheduleNextRound: () => void;
    scheduleNpcTurn: () => void;
    isNpcPlayerId: (playerId: string) => boolean;
    buildDealSequenceForPlayer: (playerId: string) => unknown;
    prepareRoundState: (options?: RoundPreparationOptions) => void;
};

export {
    beginRoomTurnForCurrentPlayer,
    endRoomTurn
} from './roomTurnLifecycleRuntime.js';

export {
    resolveRoomRound,
    scheduleRoomNextRound,
    startRoomNextRound
} from './roomRoundResolutionRuntime.js';
