import type { PendingInteraction } from '@newhandarky/hanakoji-game-types';
import {
    getNpcDifficultyLabel,
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

export type NpcSeatUpdate = {
    npcId: string;
    difficulty: NpcDifficulty;
    seat: RoomSeat;
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
