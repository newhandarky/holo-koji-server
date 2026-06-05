import {
    type Geisha,
    type GeishaSet
} from '@newhandarky/hanakoji-game-types';
import {
    canStartGameWithOrder,
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import { type NpcDifficulty } from '../npc/npcConfig.js';
import { backendLogger } from '../utils/runtimeLogger.js';
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

export const startRoomGameWithOrder = (room: RoomOpeningRuntime): void => {
    const playerIds = room.players.map(player => player.playerId);
    const orderDecisionResult = room.orderDecisionState.result;
    if (!orderDecisionResult || !canStartGameWithOrder(
        playerIds,
        orderDecisionResult,
        room.orderDecisionState.confirmations,
        room.readyConfirmations
    )) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 開局條件尚未完成，拒絕提前發牌`, {
            roomId: room.roomId,
            hasOrderResult: Boolean(room.orderDecisionState.result),
            confirmedOrder: Array.from(room.orderDecisionState.confirmations),
            confirmedReady: Array.from(room.readyConfirmations)
        });
        return;
    }

    const { order } = orderDecisionResult;
    if (!room.ensureBaseGeishas()) {
        return;
    }
    room.prepareRoundState({
        orderedPlayerIds: order,
        roundNumber: room.gameState?.round ?? 1,
        openOrderDecision: false
    });
    room.lastRoundStarterId = order[0] ?? null;

    backendLogger.info(`🚀 遊戲開始`, {
        roomId: room.roomId,
        geishaSet: room.geishaSet,
        firstPlayer: order[0],
        secondPlayer: order[1]
    });

    room.broadcastGameStateEvent('GAME_STARTED');

    if (room.dealSequence.length > 0) {
        room.players.forEach((player) => {
            room.sendToPlayer(player.playerId, {
                type: 'DEAL_ANIMATION',
                payload: {
                    sequence: room.buildDealSequenceForPlayer(player.playerId)
                }
            });
        });
    }

    room.beginTurnForCurrentPlayer();

    room.orderDecisionState = createOrderDecisionState();
    room.readyConfirmations.clear();
};
