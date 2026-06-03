import type {
    GeishaSet,
    ItemCard,
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';
import { DEFAULT_GEISHA_SET } from './geishaSetCatalog.js';
import type { ServerGameState } from './serverGameStateTypes.js';

export interface VisibleStateOptions {
    geishaSet?: GeishaSet;
}

export const sanitizePendingInteractionForViewer = (
    pendingInteraction: PendingInteraction | null | undefined,
    viewerId: string
): PendingInteraction | null => {
    if (!pendingInteraction) {
        return null;
    }

    if (pendingInteraction.targetPlayerId === viewerId) {
        return pendingInteraction;
    }

    if (pendingInteraction.type === 'GIFT_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            offeredCards: []
        };
    }

    if (pendingInteraction.type === 'COMPETITION_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            groups: []
        };
    }

    return null;
};

export const createHiddenCard = (prefix: string, index: number): ItemCard => ({
    id: `hidden-${prefix}-${index}`,
    geishaId: 0,
    type: 'hidden'
});

export const createHiddenCards = (count: number, prefix: string): ItemCard[] => Array.from({ length: count }, (_, index) => createHiddenCard(prefix, index));

export const buildPlayerVisibleGameState = (
    gameState: ServerGameState | null | undefined,
    viewerId: string,
    options: VisibleStateOptions = {}
): ServerGameState | null => {
    if (!gameState) {
        return null;
    }

    const activeGeishaSet = gameState.geishaSet ?? options.geishaSet ?? DEFAULT_GEISHA_SET;
    const sanitizedPlayers = (gameState.players ?? []).map((player): Player => {
        if (player.id === viewerId) {
            return player;
        }

        return {
            ...player,
            hand: createHiddenCards(player.hand?.length ?? 0, `${player.id}-hand`),
            secretCards: [],
            discardedCards: createHiddenCards(player.discardedCards?.length ?? 0, `${player.id}-discard`)
        };
    });

    return {
        ...gameState,
        geishaSet: activeGeishaSet,
        players: sanitizedPlayers,
        drawPile: [],
        removedCard: null,
        settlement: gameState.phase === 'ended'
            ? {
                ...(gameState.settlement ?? {}),
                ...(gameState.removedCard ? { removedCard: gameState.removedCard } : {})
            }
            : undefined,
        pendingInteraction: sanitizePendingInteractionForViewer(gameState.pendingInteraction, viewerId)
    };
};
