import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionType, Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    buildNpcActionChoice,
    pickNpcGiftCardResponse,
    pickRandomCards,
    type NpcStrategyPlayer
} from './npcStrategy.js';

const makeGeisha = (id: number, charmPoints: number): Geisha => ({
    id,
    name: `Geisha ${id}`,
    charmPoints,
    imageUrl: `https://example.test/geisha-${id}.png`,
    controlledBy: null
});

const makeCard = (id: string, geishaId: number): ItemCard => ({
    id,
    geishaId,
    type: 'item'
});

const makePlayer = (overrides: Partial<NpcStrategyPlayer> = {}): NpcStrategyPlayer => ({
    hand: [],
    playedCards: [],
    actionTokens: [],
    ...overrides
});

const makeRandom = (values: number[]) => {
    let index = 0;
    return (): number => {
        const value = values[index] ?? 0;
        index += 1;
        return value;
    };
};

test('npcStrategy barrel re-exports card selection helpers', () => {
    const cards = [
        makeCard('a', 1),
        makeCard('b', 2),
        makeCard('c', 3)
    ];

    const picked = pickRandomCards(cards, 2, makeRandom([0.9, 0]));

    assert.deepEqual(picked.map(card => card.id), ['c', 'a']);
});

test('npcStrategy barrel re-exports action planner helpers', () => {
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5), makeGeisha(3, 3), makeGeisha(4, 4)];
    const actionTokens = (['secret', 'trade-off', 'gift', 'competition'] as ActionType[])
        .map((type) => ({ type, used: false }));
    const npcPlayer = makePlayer({
        actionTokens,
        hand: [
            makeCard('one', 1),
            makeCard('two', 2),
            makeCard('three', 3),
            makeCard('four', 4)
        ]
    });

    const action = buildNpcActionChoice(npcPlayer, makePlayer(), geishas, 'medium', makeRandom([0]));

    assert.equal(action?.type, 'INITIATE_COMPETITION');
});

test('npcStrategy barrel re-exports response strategy helpers', () => {
    const offered = [
        makeCard('small', 1),
        makeCard('swing', 2)
    ];

    assert.equal(pickNpcGiftCardResponse(offered, 'easy', null, null, [], makeRandom([0]))?.id, 'small');
});
