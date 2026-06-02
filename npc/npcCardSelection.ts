import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    applyCardsToSnapshot,
    buildGeishaCountSnapshot,
    evaluateSnapshot,
    getCardUtility
} from './npcEvaluation.js';

export type RandomSource = () => number;

export type NpcCardSelectionPlayer = {
    hand: ItemCard[];
    playedCards: ItemCard[];
};

export const defaultRandom: RandomSource = () => Math.random();

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
    npcPlayer: NpcCardSelectionPlayer,
    opponent: NpcCardSelectionPlayer,
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
    npcPlayer: NpcCardSelectionPlayer,
    opponent: NpcCardSelectionPlayer,
    geishas: readonly Pick<Geisha, 'id' | 'charmPoints'>[]
): ItemCard[] => {
    const snapshot = buildGeishaCountSnapshot(geishas, npcPlayer, opponent);
    const scored = [...npcPlayer.hand].sort((a, b) => (
        getCardUtility(snapshot, b.geishaId, true) - getCardUtility(snapshot, a.geishaId, true)
    ));
    return scored.slice(0, 4);
};

export const pickGiftCards = (
    npcPlayer: NpcCardSelectionPlayer,
    opponent: NpcCardSelectionPlayer,
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
    npcPlayer: NpcCardSelectionPlayer,
    opponent: NpcCardSelectionPlayer,
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
