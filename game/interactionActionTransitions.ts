import type {
    OpeningDealSummary,
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';
import { getCardOwnershipError } from './actionValidation.js';
import {
    cloneTransitionPlayer,
    closeOpeningDealReplay,
    markTransitionActionUsed,
    removeTransitionCards,
    selectTransitionCards
} from './actionTransitionHelpers.js';
import type {
    InteractionInitiationTransition,
    InteractionResolutionTransition,
    TransitionResult
} from './actionTransitionTypes.js';

export const initiateGiftAction = (
    player: Player,
    opponentId: string | null,
    cardIds: readonly string[],
    openingDeal?: OpeningDealSummary
): TransitionResult<InteractionInitiationTransition> => {
    if (cardIds.length !== 3) {
        return { ok: false, errorMessage: '贈予必須選擇 3 張卡片' };
    }

    const ownershipError = getCardOwnershipError(player, cardIds);
    if (ownershipError) {
        return { ok: false, errorMessage: ownershipError };
    }

    if (!opponentId) {
        return { ok: false, errorMessage: '目前沒有對手可進行贈予' };
    }

    const offeredCards = selectTransitionCards(player.hand, cardIds);
    if (offeredCards.length !== 3) {
        return { ok: false, errorMessage: '贈予卡片驗證失敗' };
    }

    const updatedPlayer = markTransitionActionUsed(player, 'gift');
    updatedPlayer.hand = removeTransitionCards(updatedPlayer.hand, cardIds);

    return {
        ok: true,
        value: {
            player: updatedPlayer,
            openingDeal: closeOpeningDealReplay(openingDeal),
            pendingInteraction: {
                type: 'GIFT_SELECTION',
                initiatorId: player.id,
                targetPlayerId: opponentId,
                offeredCards
            }
        }
    };
};

export const resolveGiftAction = (
    players: readonly Player[],
    pendingInteraction: PendingInteraction | null | undefined,
    playerId: string,
    chosenCardId?: string
): TransitionResult<InteractionResolutionTransition & { chosenCardId: string }> => {
    if (!pendingInteraction || pendingInteraction.type !== 'GIFT_SELECTION') {
        return { ok: false, errorMessage: '目前沒有等待處理的贈予' };
    }

    if (pendingInteraction.targetPlayerId !== playerId) {
        return { ok: false, errorMessage: '你不是贈予的目標玩家' };
    }

    const offeredCards = pendingInteraction.offeredCards ?? [];
    const chosenCard = offeredCards.find(card => card.id === chosenCardId);
    if (!chosenCard) {
        return { ok: false, errorMessage: '選擇的卡片不存在' };
    }

    const initiator = players.find(player => player.id === pendingInteraction.initiatorId);
    const receiver = players.find(player => player.id === playerId);
    if (!initiator || !receiver) {
        return { ok: false, errorMessage: '找不到贈予對象' };
    }

    const updatedInitiator = cloneTransitionPlayer(initiator);
    const updatedReceiver = cloneTransitionPlayer(receiver);
    updatedReceiver.playedCards.push(chosenCard);
    updatedInitiator.playedCards.push(...offeredCards.filter(card => card.id !== chosenCardId));

    return {
        ok: true,
        value: {
            players: players.map(player => {
                if (player.id === updatedInitiator.id) {
                    return updatedInitiator;
                }
                if (player.id === updatedReceiver.id) {
                    return updatedReceiver;
                }
                return cloneTransitionPlayer(player);
            }),
            pendingInteraction: null,
            initiatorId: updatedInitiator.id,
            targetPlayerId: updatedReceiver.id,
            chosenCardId: chosenCard.id
        }
    };
};

export const initiateCompetitionAction = (
    player: Player,
    opponentId: string | null,
    groups: readonly (readonly string[])[],
    openingDeal?: OpeningDealSummary
): TransitionResult<InteractionInitiationTransition> => {
    if (groups.length !== 2 || groups.some(group => group.length !== 2)) {
        return { ok: false, errorMessage: '競爭必須分成兩組，每組 2 張卡片' };
    }

    if (!opponentId) {
        return { ok: false, errorMessage: '目前沒有對手可進行競爭' };
    }

    const flattened = groups.flat();
    const ownershipError = getCardOwnershipError(player, flattened);
    if (ownershipError) {
        return { ok: false, errorMessage: ownershipError };
    }

    const groupedCards = groups.map(group => selectTransitionCards(player.hand, group));
    if (groupedCards.some(group => group.length !== 2)) {
        return { ok: false, errorMessage: '競爭分組驗證失敗' };
    }

    const updatedPlayer = markTransitionActionUsed(player, 'competition');
    updatedPlayer.hand = removeTransitionCards(updatedPlayer.hand, flattened);

    return {
        ok: true,
        value: {
            player: updatedPlayer,
            openingDeal: closeOpeningDealReplay(openingDeal),
            pendingInteraction: {
                type: 'COMPETITION_SELECTION',
                initiatorId: player.id,
                targetPlayerId: opponentId,
                groups: groupedCards
            }
        }
    };
};

export const resolveCompetitionAction = (
    players: readonly Player[],
    pendingInteraction: PendingInteraction | null | undefined,
    playerId: string,
    chosenGroupIndex?: number
): TransitionResult<InteractionResolutionTransition & { chosenGroupIndex: number }> => {
    if (!pendingInteraction || pendingInteraction.type !== 'COMPETITION_SELECTION') {
        return { ok: false, errorMessage: '目前沒有等待處理的競爭' };
    }

    if (pendingInteraction.targetPlayerId !== playerId) {
        return { ok: false, errorMessage: '你不是競爭的目標玩家' };
    }

    const groups = pendingInteraction.groups ?? [];
    const selectedGroupIndex = typeof chosenGroupIndex === 'number' ? chosenGroupIndex : null;
    const selectedGroup = selectedGroupIndex === null ? undefined : groups[selectedGroupIndex];
    if (selectedGroupIndex === null || !selectedGroup) {
        return { ok: false, errorMessage: '選擇的組別不存在' };
    }

    const initiator = players.find(player => player.id === pendingInteraction.initiatorId);
    const receiver = players.find(player => player.id === playerId);
    if (!initiator || !receiver) {
        return { ok: false, errorMessage: '找不到競爭對象' };
    }

    const opponentGroupIndex = selectedGroupIndex === 0 ? 1 : 0;
    const opponentGroup = groups[opponentGroupIndex] ?? [];
    const updatedInitiator = cloneTransitionPlayer(initiator);
    const updatedReceiver = cloneTransitionPlayer(receiver);
    updatedReceiver.playedCards.push(...selectedGroup);
    updatedInitiator.playedCards.push(...opponentGroup);

    return {
        ok: true,
        value: {
            players: players.map(player => {
                if (player.id === updatedInitiator.id) {
                    return updatedInitiator;
                }
                if (player.id === updatedReceiver.id) {
                    return updatedReceiver;
                }
                return cloneTransitionPlayer(player);
            }),
            pendingInteraction: null,
            initiatorId: updatedInitiator.id,
            targetPlayerId: updatedReceiver.id,
            chosenGroupIndex: selectedGroupIndex
        }
    };
};
