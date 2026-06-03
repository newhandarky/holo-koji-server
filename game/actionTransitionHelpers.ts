import type {
    ActionType,
    ItemCard,
    OpeningDealSummary,
    Player
} from '@newhandarky/hanakoji-game-types';
import { markOpeningDealNotReplayable } from './gameStateFactory.js';

export const cloneTransitionPlayer = (player: Player): Player => ({
    ...player,
    hand: [...player.hand],
    playedCards: [...player.playedCards],
    secretCards: [...player.secretCards],
    discardedCards: [...player.discardedCards],
    actionTokens: player.actionTokens.map(token => ({ ...token })),
    score: { ...player.score }
});

export const markTransitionActionUsed = (player: Player, actionType: ActionType): Player => {
    const clonedPlayer = cloneTransitionPlayer(player);
    clonedPlayer.actionTokens = clonedPlayer.actionTokens.map(token => (
        token.type === actionType ? { ...token, used: true } : token
    ));
    return clonedPlayer;
};

export const closeOpeningDealReplay = (
    openingDeal?: OpeningDealSummary
): OpeningDealSummary | undefined => (
    openingDeal?.replayable
        ? markOpeningDealNotReplayable(openingDeal)
        : openingDeal
);

export const selectTransitionCards = (
    hand: readonly ItemCard[],
    cardIds: readonly string[]
): ItemCard[] => (
    cardIds
        .map(cardId => hand.find(card => card.id === cardId))
        .filter((card): card is ItemCard => Boolean(card))
);

export const removeTransitionCards = (
    hand: readonly ItemCard[],
    cardIds: readonly string[]
): ItemCard[] => {
    const selectedIds = new Set(cardIds);
    return hand.filter(card => !selectedIds.has(card.id));
};
