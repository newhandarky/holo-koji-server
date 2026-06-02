import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import type { NpcDifficulty } from './npcConfig.js';
import {
    defaultRandom,
    type RandomSource
} from './npcCardSelection.js';
import type { NpcStrategyPlayer } from './npcActionPlanner.js';
import {
    applyCardsToSnapshot,
    buildGeishaCountSnapshot,
    evaluateSnapshot,
    getCardUtility
} from './npcEvaluation.js';

export * from './npcCardSelection.js';
export * from './npcActionPlanner.js';

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
