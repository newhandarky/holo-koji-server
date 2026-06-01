import type {
    ActionType,
    ItemCard,
    OpeningDealSummary,
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';
import { markOpeningDealNotReplayable } from '../utils/gameUtils.js';
import { getCardOwnershipError } from './actionValidation.js';

type TransitionFailure = {
    ok: false;
    errorMessage: string;
};

type TransitionSuccess<T> = {
    ok: true;
    value: T;
};

export type TransitionResult<T> = TransitionFailure | TransitionSuccess<T>;

export type PlayerActionTransition = {
    player: Player;
    openingDeal?: OpeningDealSummary;
    revealedCardIds: string[];
};

export type InteractionInitiationTransition = {
    player: Player;
    openingDeal?: OpeningDealSummary;
    pendingInteraction: PendingInteraction;
};

export type InteractionResolutionTransition = {
    players: Player[];
    pendingInteraction: null;
    initiatorId: string;
    targetPlayerId: string;
};

const clonePlayer = (player: Player): Player => ({
    ...player,
    hand: [...player.hand],
    playedCards: [...player.playedCards],
    secretCards: [...player.secretCards],
    discardedCards: [...player.discardedCards],
    actionTokens: player.actionTokens.map(token => ({ ...token })),
    score: { ...player.score }
});

const markActionUsed = (player: Player, actionType: ActionType): Player => {
    const clonedPlayer = clonePlayer(player);
    clonedPlayer.actionTokens = clonedPlayer.actionTokens.map(token => (
        token.type === actionType ? { ...token, used: true } : token
    ));
    return clonedPlayer;
};

const closeOpeningDealReplay = (
    openingDeal?: OpeningDealSummary
): OpeningDealSummary | undefined => (
    openingDeal?.replayable
        ? markOpeningDealNotReplayable(openingDeal)
        : openingDeal
);

const selectCards = (hand: readonly ItemCard[], cardIds: readonly string[]): ItemCard[] => (
    cardIds
        .map(cardId => hand.find(card => card.id === cardId))
        .filter((card): card is ItemCard => Boolean(card))
);

const removeCards = (hand: readonly ItemCard[], cardIds: readonly string[]): ItemCard[] => {
    const selectedIds = new Set(cardIds);
    return hand.filter(card => !selectedIds.has(card.id));
};

export const applySecretAction = (
    player: Player,
    cardId?: string,
    openingDeal?: OpeningDealSummary
): TransitionResult<PlayerActionTransition> => {
    if (!cardId) {
        return { ok: false, errorMessage: '請選擇 1 張卡片作為密約' };
    }

    const card = player.hand.find(item => item.id === cardId);
    if (!card) {
        return { ok: false, errorMessage: '卡片不在你的手牌中' };
    }

    const updatedPlayer = markActionUsed(player, 'secret');
    updatedPlayer.hand = removeCards(updatedPlayer.hand, [cardId]);
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

    const selectedCards = selectCards(player.hand, cardIds);
    if (selectedCards.length !== 2) {
        return { ok: false, errorMessage: '取捨卡片驗證失敗' };
    }

    const updatedPlayer = markActionUsed(player, 'trade-off');
    updatedPlayer.hand = removeCards(updatedPlayer.hand, cardIds);
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

    const offeredCards = selectCards(player.hand, cardIds);
    if (offeredCards.length !== 3) {
        return { ok: false, errorMessage: '贈予卡片驗證失敗' };
    }

    const updatedPlayer = markActionUsed(player, 'gift');
    updatedPlayer.hand = removeCards(updatedPlayer.hand, cardIds);

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

    const updatedInitiator = clonePlayer(initiator);
    const updatedReceiver = clonePlayer(receiver);
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
                return clonePlayer(player);
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

    const groupedCards = groups.map(group => selectCards(player.hand, group));
    if (groupedCards.some(group => group.length !== 2)) {
        return { ok: false, errorMessage: '競爭分組驗證失敗' };
    }

    const updatedPlayer = markActionUsed(player, 'competition');
    updatedPlayer.hand = removeCards(updatedPlayer.hand, flattened);

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
    const updatedInitiator = clonePlayer(initiator);
    const updatedReceiver = clonePlayer(receiver);
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
                return clonePlayer(player);
            }),
            pendingInteraction: null,
            initiatorId: updatedInitiator.id,
            targetPlayerId: updatedReceiver.id,
            chosenGroupIndex: selectedGroupIndex
        }
    };
};
