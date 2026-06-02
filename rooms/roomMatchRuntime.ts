import type {
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    buildConfirmationUpdate,
    createOrderDecisionState,
    type OrderDecisionState
} from '../game/openingFlow.js';
import {
    buildReadyCheckState,
    buildRematchConfirmationUpdate
} from '../game/matchConfirmationFlow.js';
import {
    getNpcThinkingDelay,
    type NpcDifficulty
} from '../npc/npcConfig.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import type { RoomScheduler } from './roomScheduler.js';
import type { WireMessage } from './roomMessaging.js';

export type RoomMatchRuntime = {
    roomId: string;
    players: Array<{ playerId: string }>;
    gameState: Pick<ServerGameState, 'phase'> | null;
    npcId: string | null;
    npcDifficulty: NpcDifficulty | null;
    scheduler: RoomScheduler;
    rematchConfirmations: Set<string>;
    readyConfirmations: Set<string>;
    lastRoundStarterId: string | null;
    currentCompletionId: string | null;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    orderDecisionState: OrderDecisionState;
    validatePlayerInRoom: (playerId: string) => boolean;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    clearNpcTimers: () => void;
    regenerateBaseGeishas: () => boolean;
    startOrderDecision: () => void;
    startGameWithOrder: () => void;
    confirmReady: (playerId: string) => void;
};

export const requestRoomRematch = (
    room: RoomMatchRuntime,
    playerId: string
): void => {
    if (!room.validatePlayerInRoom(playerId)) {
        return;
    }

    const update = buildRematchConfirmationUpdate(
        room.players.map(player => player.playerId),
        room.rematchConfirmations,
        playerId,
        room.npcId
    );
    room.rematchConfirmations = new Set(update.confirmations);

    if (update.shouldStartRematch) {
        startRoomRematch(room);
    } else {
        room.broadcast({
            type: 'REMATCH_REQUESTED',
            payload: {
                confirmations: update.confirmations
            }
        });
    }
};

export const startRoomReadyCheck = (room: RoomMatchRuntime): void => {
    if (!room.gameState) {
        return;
    }

    const playerIds = room.players.map(player => player.playerId);
    const readyState = buildReadyCheckState(playerIds);
    room.readyConfirmations = new Set(readyState.confirmations);

    room.broadcast({
        type: 'READY_CHECK',
        payload: {
            confirmations: readyState.confirmations,
            waitingFor: readyState.waitingFor
        }
    });

    if (room.npcId) {
        const delay = getNpcThinkingDelay(room.npcDifficulty);
        room.scheduler.setTimeout(() => {
            if (room.npcId) {
                room.confirmReady(room.npcId);
            }
        }, delay);
    }
};

export const confirmRoomReady = (
    room: RoomMatchRuntime,
    playerId: string
): void => {
    if (!room.validatePlayerInRoom(playerId)) {
        return;
    }

    if (!room.orderDecisionState.result || room.gameState?.phase !== 'deciding_order') {
        backendLogger.info(`ℹ️ 玩家 ${playerId} 的準備確認不在有效開局階段，忽略重送`, {
            roomId: room.roomId,
            playerId,
            phase: room.gameState?.phase
        });
        return;
    }

    const update = buildConfirmationUpdate(
        room.players.map(player => player.playerId),
        room.readyConfirmations,
        playerId
    );
    if (!update.added) {
        backendLogger.info(`ℹ️ 玩家 ${playerId} 重複準備確認，忽略重送`, {
            roomId: room.roomId,
            playerId
        });
        return;
    }

    room.readyConfirmations = new Set(update.confirmations);

    room.broadcast({
        type: 'READY_STATUS',
        payload: {
            confirmations: update.confirmations,
            waitingFor: update.waitingFor
        }
    });

    if (update.waitingFor.length === 0) {
        room.startGameWithOrder();
    }
};

export const startRoomRematch = (room: RoomMatchRuntime): void => {
    backendLogger.info(`🔁 房間 ${room.roomId} 重新開始對戰`, {
        roomId: room.roomId,
        geishaSet: room.geishaSet,
        setupMode: room.setupMode
    });

    room.clearNpcTimers();
    room.rematchConfirmations.clear();
    room.lastRoundStarterId = null;
    room.currentCompletionId = null;
    if (!room.regenerateBaseGeishas()) {
        return;
    }
    room.orderDecisionState = createOrderDecisionState();

    room.startOrderDecision();
};
