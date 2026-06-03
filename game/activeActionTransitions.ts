import type {
    ItemCard,
    OpeningDealSummary,
    Player
} from '@newhandarky/hanakoji-game-types';
import { getCardOwnershipError } from './actionValidation.js';
import {
    closeOpeningDealReplay,
    markTransitionActionUsed,
    removeTransitionCards,
    selectTransitionCards
} from './actionTransitionHelpers.js';
import type {
    PlayerActionTransition,
    TransitionResult
} from './actionTransitionTypes.js';

export const applySecretAction = (
    player: Player,
    cardId?: string,
    openingDeal?: OpeningDealSummary
): TransitionResult<PlayerActionTransition> => {
    if (!cardId) {
        return { ok: false, errorMessage: '請選擇 1 張卡片作為密約' };
    }

    const card = player.hand.find((item: ItemCard) => item.id === cardId);
    if (!card) {
        return { ok: false, errorMessage: '卡片不在你的手牌中' };
    }

    const updatedPlayer = markTransitionActionUsed(player, 'secret');
    updatedPlayer.hand = removeTransitionCards(updatedPlayer.hand, [cardId]);
    updatedPlayer.secretCards.push(card);

    return {
        ok: true,
        value: {
            player: updatedPlayer,
            openingDeal: closeOpeningDealReplay(openingDeal),
            revealedCardIds: [card.id]
        }
    };
};

export const applyTradeOffAction = (
    player: Player,
    cardIds: readonly string[],
    openingDeal?: OpeningDealSummary
): TransitionResult<PlayerActionTransition> => {
    if (cardIds.length !== 2) {
        return { ok: false, errorMessage: '取捨必須選擇 2 張卡片' };
    }

    const ownershipError = getCardOwnershipError(player, cardIds);
    if (ownershipError) {
        return { ok: false, errorMessage: ownershipError };
    }

    const selectedCards = selectTransitionCards(player.hand, cardIds);
    if (selectedCards.length !== 2) {
        return { ok: false, errorMessage: '取捨卡片驗證失敗' };
    }

    const updatedPlayer = markTransitionActionUsed(player, 'trade-off');
    updatedPlayer.hand = removeTransitionCards(updatedPlayer.hand, cardIds);
    updatedPlayer.discardedCards.push(...selectedCards);

    return {
        ok: true,
        value: {
            player: updatedPlayer,
            openingDeal: closeOpeningDealReplay(openingDeal),
            revealedCardIds: [...cardIds]
        }
    };
};
