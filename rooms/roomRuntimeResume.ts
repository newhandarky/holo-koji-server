import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import { canScheduleNpcResponse } from './roomNpcRuntime.js';

export type RoomRuntimeResume = {
    gameState: Pick<ServerGameState, 'phase'> & Partial<ServerGameState> | null;
    players?: Array<{ playerId: string }>;
    npcId?: string | null;
    orderDecisionState?: OrderDecisionState;
    startOrderDecision?: () => void;
    startReadyCheck?: () => void;
    scheduleNextRound?: () => void;
    scheduleNpcResponse?: () => void;
    scheduleNpcTurn?: () => void;
};

export const resumeRestoredRoomRuntime = (room: RoomRuntimeResume): void => {
    if (!room.gameState) {
        return;
    }

    if (room.gameState.phase === 'deciding_order') {
        const result = room.gameState.orderDecision?.result;
        if (!result) {
            room.startOrderDecision?.();
            return;
        }

        room.orderDecisionState = {
            ...createOrderDecisionState(),
            isDeciding: false,
            result: {
                firstPlayer: result.firstPlayer,
                secondPlayer: result.secondPlayer,
                order: [...result.order]
            },
            confirmations: new Set(room.gameState.orderDecision?.confirmations ?? [])
        };
        if (room.orderDecisionState.confirmations.size >= (room.players?.length ?? 0)) {
            room.startReadyCheck?.();
        }
        return;
    }

    if (room.gameState.phase === 'resolution') {
        room.scheduleNextRound?.();
        return;
    }

    if (room.gameState.phase === 'playing') {
        if (canScheduleNpcResponse(room.gameState.pendingInteraction, room.npcId ?? null)) {
            room.scheduleNpcResponse?.();
            return;
        }
        room.scheduleNpcTurn?.();
    }
};
