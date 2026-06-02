import type { PendingInteraction } from '@newhandarky/hanakoji-game-types';
import {
    getNpcDifficultyLabel,
    getNpcThinkingDelay,
    normalizeNpcDifficulty,
    type NpcDifficulty
} from '../npc/npcConfig.js';
import {
    buildNpcActionChoice,
    pickNpcCompetitionGroupResponse,
    pickNpcGiftCardResponse
} from '../npc/npcStrategy.js';
import type { ServerAction } from '../game/actionValidation.js';
import type { ServerGameState } from '../utils/gameUtils.js';
import {
    createNpcSocket,
    type RoomSeat
} from '../utils/roomSession.js';
import {
    replaceScheduledTimer,
    type RoomScheduler,
    type TimerHandle
} from './roomScheduler.js';

export type NpcSeatUpdate = {
    npcId: string;
    difficulty: NpcDifficulty;
    seat: RoomSeat;
};

export type RoomNpcRuntime = {
    gameState: ServerGameState | null;
    npcId: string | null;
    npcDifficulty: NpcDifficulty | null;
    npcActionTimer: TimerHandle | null;
    npcResponseTimer: TimerHandle | null;
    scheduler: RoomScheduler;
    performNpcAction: () => void;
    performNpcResponse: () => void;
    endTurn: () => void;
    handleAction: (playerId: string, action: ServerAction) => void;
};

export const buildNpcSeat = (difficulty: unknown = 'easy'): NpcSeatUpdate => {
    const normalized = normalizeNpcDifficulty(difficulty);
    const npcId = getNpcDifficultyLabel(normalized);
    return {
        npcId,
        difficulty: normalized,
        seat: {
            playerId: npcId,
            ws: createNpcSocket(),
            isNpc: true,
            name: npcId,
            lineUserId: undefined,
            avatarUrl: undefined,
            accountProfile: undefined
        }
    };
};

export const canScheduleNpcTurn = (
    gameState: ServerGameState | null,
    npcId: string | null
): boolean => {
    if (!gameState || !npcId || gameState.phase !== 'playing' || gameState.pendingInteraction) {
        return false;
    }
    return gameState.players[gameState.currentPlayer]?.id === npcId;
};

export const canScheduleNpcResponse = (
    pendingInteraction: PendingInteraction | null | undefined,
    npcId: string | null
): boolean => (
    Boolean(npcId)
    && pendingInteraction?.targetPlayerId === npcId
);

export const buildNpcTurnAction = (
    gameState: ServerGameState | null,
    npcId: string | null,
    difficulty: NpcDifficulty | null
): ServerAction | null => {
    if (!canScheduleNpcTurn(gameState, npcId) || !gameState || !npcId) {
        return null;
    }
    const npcPlayer = gameState.players.find(player => player.id === npcId);
    const opponent = gameState.players.find(player => player.id !== npcId);
    if (!npcPlayer || !opponent) {
        return null;
    }
    return buildNpcActionChoice(npcPlayer, opponent, gameState.geishas, difficulty);
};

export const buildNpcResponseAction = (
    gameState: ServerGameState | null,
    npcId: string | null,
    difficulty: NpcDifficulty | null
): ServerAction | null => {
    const pending = gameState?.pendingInteraction;
    if (!canScheduleNpcResponse(pending, npcId) || !gameState || !npcId || !pending) {
        return null;
    }
    const npcPlayer = gameState.players.find(player => player.id === npcId) ?? null;
    const opponent = gameState.players.find(player => player.id !== npcId) ?? null;

    if (pending.type === 'GIFT_SELECTION') {
        const card = pickNpcGiftCardResponse(
            pending.offeredCards ?? [],
            difficulty,
            npcPlayer,
            opponent,
            gameState.geishas
        );
        return card
            ? { type: 'RESOLVE_GIFT', payload: { chosenCardId: card.id } }
            : null;
    }

    if (pending.type === 'COMPETITION_SELECTION') {
        const index = pickNpcCompetitionGroupResponse(
            pending.groups ?? [],
            difficulty,
            npcPlayer,
            opponent,
            gameState.geishas
        );
        return index !== null
            ? { type: 'RESOLVE_COMPETITION', payload: { chosenGroupIndex: index } }
            : null;
    }

    return null;
};

export const clearRoomNpcTimers = (
    room: Pick<RoomNpcRuntime, 'npcActionTimer' | 'npcResponseTimer' | 'scheduler'>
): void => {
    if (room.npcActionTimer) {
        room.scheduler.clearTimeout(room.npcActionTimer);
        room.npcActionTimer = null;
    }
    if (room.npcResponseTimer) {
        room.scheduler.clearTimeout(room.npcResponseTimer);
        room.npcResponseTimer = null;
    }
};

export const scheduleRoomNpcTurn = (
    room: Pick<RoomNpcRuntime, 'gameState' | 'npcId' | 'npcDifficulty' | 'npcActionTimer' | 'scheduler' | 'performNpcAction'>
): void => {
    if (!canScheduleNpcTurn(room.gameState, room.npcId)) {
        return;
    }

    const delay = getNpcThinkingDelay(room.npcDifficulty);
    room.npcActionTimer = replaceScheduledTimer(room.scheduler, room.npcActionTimer, () => {
        room.npcActionTimer = null;
        room.performNpcAction();
    }, delay);
};

export const scheduleRoomNpcResponse = (
    room: Pick<RoomNpcRuntime, 'gameState' | 'npcId' | 'npcDifficulty' | 'npcResponseTimer' | 'scheduler' | 'performNpcResponse'>
): void => {
    if (!canScheduleNpcResponse(room.gameState?.pendingInteraction, room.npcId)) {
        return;
    }

    const delay = getNpcThinkingDelay(room.npcDifficulty);
    room.npcResponseTimer = replaceScheduledTimer(room.scheduler, room.npcResponseTimer, () => {
        room.npcResponseTimer = null;
        room.performNpcResponse();
    }, delay);
};

export const performRoomNpcAction = (
    room: Pick<RoomNpcRuntime, 'gameState' | 'npcId' | 'npcDifficulty' | 'endTurn' | 'handleAction'>
): void => {
    const npcId = room.npcId;
    if (!canScheduleNpcTurn(room.gameState, npcId) || !npcId) {
        return;
    }
    const action = buildNpcTurnAction(room.gameState, npcId, room.npcDifficulty);
    if (!action) {
        room.endTurn();
        return;
    }

    room.handleAction(npcId, action);
};

export const performRoomNpcResponse = (
    room: Pick<RoomNpcRuntime, 'gameState' | 'npcId' | 'npcDifficulty' | 'handleAction'>
): void => {
    const action = buildNpcResponseAction(room.gameState, room.npcId, room.npcDifficulty);
    if (action && room.npcId) {
        room.handleAction(room.npcId, action);
    }
};

export const buildRoomNpcAction = (
    room: Pick<RoomNpcRuntime, 'gameState' | 'npcDifficulty'>,
    player: { id: string }
): ServerAction | null => buildNpcTurnAction(room.gameState, player.id, room.npcDifficulty);
