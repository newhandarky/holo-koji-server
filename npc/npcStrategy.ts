import type { ActionType, Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import type { NpcDifficulty } from './npcConfig.js';
import {
    buildNpcCompetitionGroups,
    buildNpcRandomGroups,
    defaultRandom,
    pickCompetitionCards,
    pickGiftCards,
    pickRandomCards,
    pickTradeOffCards,
    type RandomSource
} from './npcCardSelection.js';
import {
    applyCardsToSnapshot,
    buildGeishaCountSnapshot,
    evaluateSnapshot,
    getCardUtility,
    type NpcSnapshot
} from './npcEvaluation.js';

export {
    buildNpcCompetitionGroups,
    buildNpcRandomGroups,
    pickCompetitionCards,
    pickGiftCards,
    pickRandomCards,
    pickTradeOffCards
} from './npcCardSelection.js';
export type { RandomSource } from './npcCardSelection.js';

export type NpcStrategyPlayer = {
    hand: ItemCard[];
    playedCards: ItemCard[];
    actionTokens: Array<{
        type: ActionType;
        used: boolean;
    }>;
};

export type NpcServerAction =
    | { type: 'PLAY_SECRET'; payload: { cardId: string } }
    | { type: 'PLAY_TRADE_OFF'; payload: { cardIds: string[] } }
    | { type: 'INITIATE_GIFT'; payload: { cardIds: string[] } }
    | { type: 'INITIATE_COMPETITION'; payload: { groups: string[][] } };

export const evaluateNpcAction = (
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    snapshot: NpcSnapshot,
    actionType: ActionType
): number => {
    if (actionType === 'secret') {
        const bestCard = [...npcPlayer.hand]
            .sort((a, b) => getCardUtility(snapshot, b.geishaId, true) - getCardUtility(snapshot, a.geishaId, true))[0];
        if (!bestCard) {
            return -Infinity;
        }
        const next = applyCardsToSnapshot(snapshot, [bestCard.geishaId], true);
        return evaluateSnapshot(next);
    }

    if (actionType === 'trade-off') {
        const discard = pickTradeOffCards(npcPlayer, opponent, geishas);
        const loss = discard.reduce((sum, card) => sum + getCardUtility(snapshot, card.geishaId, true), 0);
        return evaluateSnapshot(snapshot) - loss;
    }

    if (actionType === 'gift') {
        const offered = pickGiftCards(npcPlayer, opponent, geishas);
        if (offered.length < 3) {
            return -Infinity;
        }
        const worst = Math.min(...offered.map((chosen) => {
            const npcCards = offered.filter(card => card.id !== chosen.id);
            const next = applyCardsToSnapshot(
                applyCardsToSnapshot(snapshot, [chosen.geishaId], false),
                npcCards.map(card => card.geishaId),
                true
            );
            return evaluateSnapshot(next);
        }));
        return worst;
    }

    if (actionType === 'competition') {
        const picked = pickCompetitionCards(npcPlayer, opponent, geishas);
        if (picked.length < 4) {
            return -Infinity;
        }
        const [groupA = [], groupB = []] = buildNpcCompetitionGroups(picked, npcPlayer, opponent, geishas);
        const idToGeisha = new Map(picked.map(card => [card.id, card.geishaId]));
        const g1 = groupA.map(cardId => idToGeisha.get(cardId)).filter((geishaId): geishaId is number => typeof geishaId === 'number');
        const g2 = groupB.map(cardId => idToGeisha.get(cardId)).filter((geishaId): geishaId is number => typeof geishaId === 'number');
        const worst = Math.min(
            evaluateSnapshot(applyCardsToSnapshot(snapshot, g1, false)),
            evaluateSnapshot(applyCardsToSnapshot(snapshot, g2, false))
        );
        return worst;
    }

    return -Infinity;
};

export const pickBestNpcAction = (
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    candidates: readonly ActionType[]
): ActionType | null => {
    if (!candidates || candidates.length === 0) {
        return null;
    }

    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    let bestAction: ActionType | null = null;
    let bestScore = -Infinity;

    candidates.forEach((actionType) => {
        const score = evaluateNpcAction(npcPlayer, opponent, geishas, snapshot, actionType);
        if (score > bestScore) {
            bestScore = score;
            bestAction = actionType;
        }
    });

    return bestAction;
};

export const pickNpcGiftCardResponse = (
    cards: readonly ItemCard[] = [],
    difficulty: NpcDifficulty | null | undefined,
    npcPlayer: NpcStrategyPlayer | null,
    opponent: NpcStrategyPlayer | null,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    randomSource: RandomSource = defaultRandom
): ItemCard | null => {
    if (!cards || cards.length === 0) {
        return null;
    }

    if (difficulty === 'easy') {
        return cards[Math.floor(randomSource() * cards.length)] ?? null;
    }

    if (!npcPlayer || !opponent) {
        return cards[0] ?? null;
    }

    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    return [...cards]
        .sort((a, b) => getCardUtility(snapshot, b.geishaId, true) - getCardUtility(snapshot, a.geishaId, true))[0] ?? null;
};

export const pickNpcCompetitionGroupResponse = (
    groups: readonly ItemCard[][] = [],
    difficulty: NpcDifficulty | null | undefined,
    npcPlayer: NpcStrategyPlayer | null,
    opponent: NpcStrategyPlayer | null,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    randomSource: RandomSource = defaultRandom
): number | null => {
    if (!groups || groups.length !== 2) {
        return null;
    }

    if (difficulty === 'easy') {
        return randomSource() < 0.5 ? 0 : 1;
    }

    if (!npcPlayer || !opponent) {
        return 0;
    }

    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const score = (group: readonly ItemCard[]) => evaluateSnapshot(
        applyCardsToSnapshot(snapshot, group.map(card => card.geishaId), true)
    );
    return score(groups[0] ?? []) >= score(groups[1] ?? []) ? 0 : 1;
};

export const buildNpcActionChoice = (
    player: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    difficulty: NpcDifficulty | null | undefined,
    randomSource: RandomSource = defaultRandom
): NpcServerAction | null => {
    const available = player.actionTokens.filter(token => !token.used).map(token => token.type);
    const hasCards = player.hand.length;

    const candidates = available.filter((type) => {
        if (type === 'secret') return hasCards >= 1;
        if (type === 'trade-off') return hasCards >= 2;
        if (type === 'gift') return hasCards >= 3;
        if (type === 'competition') return hasCards >= 4;
        return false;
    });

    if (candidates.length === 0) {
        return null;
    }

    const snapshot = buildGeishaCountSnapshot(geishas, player, opponent);
    const sortedByNpcValue = [...player.hand]
        .sort((a, b) => getCardUtility(snapshot, a.geishaId, true) - getCardUtility(snapshot, b.geishaId, true));

    let actionType = candidates[Math.floor(randomSource() * candidates.length)];

    if (difficulty === 'expert' || difficulty === 'hell') {
        actionType = pickBestNpcAction(player, opponent, geishas, candidates) ?? actionType;
    } else if (difficulty !== 'easy') {
        if (candidates.includes('competition')) {
            actionType = 'competition';
        } else if (candidates.includes('gift')) {
            actionType = 'gift';
        } else if (candidates.includes('secret')) {
            actionType = 'secret';
        } else {
            actionType = 'trade-off';
        }
    }

    if (actionType === 'secret') {
        const card = difficulty === 'easy'
            ? player.hand[Math.floor(randomSource() * player.hand.length)]
            : sortedByNpcValue[sortedByNpcValue.length - 1];
        if (!card) {
            return null;
        }
        return { type: 'PLAY_SECRET', payload: { cardId: card.id } };
    }

    if (actionType === 'trade-off') {
        const selected = difficulty === 'easy'
            ? pickRandomCards(player.hand, 2, randomSource)
            : pickTradeOffCards(player, opponent, geishas);
        return { type: 'PLAY_TRADE_OFF', payload: { cardIds: selected.map(card => card.id) } };
    }

    if (actionType === 'gift') {
        const selected = difficulty === 'easy'
            ? pickRandomCards(player.hand, 3, randomSource)
            : pickGiftCards(player, opponent, geishas);
        return { type: 'INITIATE_GIFT', payload: { cardIds: selected.map(card => card.id) } };
    }

    if (actionType === 'competition') {
        const picked = difficulty === 'easy'
            ? pickRandomCards(player.hand, 4, randomSource)
            : pickCompetitionCards(player, opponent, geishas);
        const groups = difficulty === 'easy'
            ? buildNpcRandomGroups(picked, randomSource)
            : buildNpcCompetitionGroups(picked, player, opponent, geishas);
        return { type: 'INITIATE_COMPETITION', payload: { groups } };
    }

    return null;
};
