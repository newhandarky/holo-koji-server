import type { ActionType, Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import type { NpcDifficulty } from './npcConfig.js';
import {
    applyCardsToSnapshot,
    buildGeishaCountSnapshot,
    evaluateSnapshot,
    getCardUtility,
    type NpcSnapshot
} from './npcEvaluation.js';

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

type RandomSource = () => number;

const defaultRandom: RandomSource = () => Math.random();

const getGeishaCharmPoints = (
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[],
    geishaId: number
): number => geishas.find(geisha => geisha.id === geishaId)?.charmPoints ?? 0;

const getCardValue = (
    card: ItemCard,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): number => getGeishaCharmPoints(geishas, card.geishaId);

export const pickRandomCards = (
    cards: readonly ItemCard[],
    count: number,
    randomSource: RandomSource = defaultRandom
): ItemCard[] => {
    const pool = [...cards];
    const picked: ItemCard[] = [];
    while (pool.length > 0 && picked.length < count) {
        const index = Math.floor(randomSource() * pool.length);
        const [card] = pool.splice(index, 1);
        if (card) {
            picked.push(card);
        }
    }
    return picked;
};

export const buildNpcRandomGroups = (
    cards: readonly ItemCard[],
    randomSource: RandomSource = defaultRandom
): string[][] => {
    const pool = [...cards];
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(randomSource() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return [
        pool.slice(0, 2).map(card => card.id),
        pool.slice(2, 4).map(card => card.id)
    ];
};

export const buildNpcCompetitionGroups = (
    cards: readonly ItemCard[],
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): string[][] => {
    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const sorted = [...cards].sort((a, b) => getCardValue(b, geishas) - getCardValue(a, geishas));
    if (sorted.length < 4) {
        return [
            sorted.slice(0, 2).map(card => card.id),
            sorted.slice(2, 4).map(card => card.id)
        ].filter(group => group.length > 0);
    }

    const groupA = [sorted[0], sorted[3]].filter((card): card is ItemCard => Boolean(card));
    const groupB = [sorted[1], sorted[2]].filter((card): card is ItemCard => Boolean(card));
    const groupOptions = [
        [groupA.map(card => card.id), groupB.map(card => card.id)],
        [[sorted[0], sorted[2]].map(card => card.id), [sorted[1], sorted[3]].map(card => card.id)],
        [[sorted[0], sorted[1]].map(card => card.id), [sorted[2], sorted[3]].map(card => card.id)]
    ];

    const idToGeisha = new Map(sorted.map(card => [card.id, card.geishaId]));
    let best = groupOptions[0] ?? [[], []];
    let bestScore = -Infinity;

    groupOptions.forEach((option) => {
        const [g1 = [], g2 = []] = option;
        const g1Geishas = g1.map(cardId => idToGeisha.get(cardId)).filter((geishaId): geishaId is number => typeof geishaId === 'number');
        const g2Geishas = g2.map(cardId => idToGeisha.get(cardId)).filter((geishaId): geishaId is number => typeof geishaId === 'number');
        const worst = Math.min(
            evaluateSnapshot(applyCardsToSnapshot(snapshot, g1Geishas, false)),
            evaluateSnapshot(applyCardsToSnapshot(snapshot, g2Geishas, false))
        );
        if (worst > bestScore) {
            bestScore = worst;
            best = option;
        }
    });

    return best;
};

export const pickCompetitionCards = (
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): ItemCard[] => {
    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const scored = [...npcPlayer.hand].sort((a, b) => (
        getCardUtility(snapshot, b.geishaId, true) - getCardUtility(snapshot, a.geishaId, true)
    ));
    return scored.slice(0, 4);
};

export const pickGiftCards = (
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): ItemCard[] => {
    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const cards = npcPlayer.hand;
    let bestCombo = cards.slice(0, 3);
    let bestScore = -Infinity;

    for (let i = 0; i < cards.length; i += 1) {
        for (let j = i + 1; j < cards.length; j += 1) {
            for (let k = j + 1; k < cards.length; k += 1) {
                const combo = [cards[i], cards[j], cards[k]].filter((card): card is ItemCard => Boolean(card));
                const worst = Math.min(...combo.map((chosen) => {
                    const npcCards = combo.filter(card => card.id !== chosen.id);
                    const next = applyCardsToSnapshot(
                        applyCardsToSnapshot(snapshot, [chosen.geishaId], false),
                        npcCards.map(card => card.geishaId),
                        true
                    );
                    return evaluateSnapshot(next);
                }));

                if (worst > bestScore) {
                    bestScore = worst;
                    bestCombo = combo;
                }
            }
        }
    }

    return bestCombo;
};

export const pickTradeOffCards = (
    npcPlayer: NpcStrategyPlayer,
    opponent: NpcStrategyPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): ItemCard[] => {
    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const sorted = [...npcPlayer.hand].sort((a, b) => {
        const npcValueA = getCardUtility(snapshot, a.geishaId, true);
        const npcValueB = getCardUtility(snapshot, b.geishaId, true);
        const oppValueA = getCardUtility(snapshot, a.geishaId, false);
        const oppValueB = getCardUtility(snapshot, b.geishaId, false);

        const scoreA = npcValueA - oppValueA * 0.6;
        const scoreB = npcValueB - oppValueB * 0.6;
        return scoreA - scoreB;
    });

    return sorted.slice(0, 2);
};

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
