import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    buildNpcRandomGroups,
    pickCompetitionCards,
    pickGiftCards,
    pickRandomCards,
    pickTradeOffCards,
    type NpcCardSelectionPlayer
} from './npcCardSelection.js';

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

const makePlayer = (overrides: Partial<NpcCardSelectionPlayer> = {}): NpcCardSelectionPlayer => ({
    hand: [],
    playedCards: [],
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

test('pickRandomCards uses injected random source without mutating hand', () => {
    const cards = [
        makeCard('a', 1),
        makeCard('b', 2),
        makeCard('c', 3),
        makeCard('d', 4)
    ];

    const picked = pickRandomCards(cards, 2, makeRandom([0.75, 0]));

    assert.deepEqual(picked.map(card => card.id), ['d', 'a']);
    assert.deepEqual(cards.map(card => card.id), ['a', 'b', 'c', 'd']);
});

test('buildNpcRandomGroups shuffles with injected random source', () => {
    const cards = [
        makeCard('a', 1),
        makeCard('b', 2),
        makeCard('c', 3),
        makeCard('d', 4)
    ];

    const groups = buildNpcRandomGroups(cards, makeRandom([0, 0, 0]));

    assert.deepEqual(groups, [['b', 'c'], ['d', 'a']]);
});

test('pickCompetitionCards chooses the highest utility cards for NPC', () => {
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5), makeGeisha(3, 3), makeGeisha(4, 4), makeGeisha(5, 1)];
    const npcPlayer = makePlayer({
        hand: [
            makeCard('low', 5),
            makeCard('swing', 2),
            makeCard('chase', 1),
            makeCard('base', 4),
            makeCard('also-base', 3)
        ],
        playedCards: [
            makeCard('npc-played-1', 1),
            makeCard('npc-played-2', 2)
        ]
    });
    const opponent = makePlayer({
        playedCards: [
            makeCard('opp-played-1', 1),
            makeCard('opp-played-2', 1),
            makeCard('opp-played-3', 2)
        ]
    });

    const picked = pickCompetitionCards(npcPlayer, opponent, geishas);

    assert.deepEqual(picked.map(card => card.id), ['swing', 'base', 'also-base', 'low']);
});

test('pickGiftCards optimizes the worst gift outcome', () => {
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5), makeGeisha(3, 3), makeGeisha(4, 4)];
    const npcPlayer = makePlayer({
        hand: [
            makeCard('low', 1),
            makeCard('swing', 2),
            makeCard('mid', 3),
            makeCard('base', 4)
        ],
        playedCards: [makeCard('npc-played', 2)]
    });
    const opponent = makePlayer({
        playedCards: [
            makeCard('opp-played-1', 1),
            makeCard('opp-played-2', 1),
            makeCard('opp-played-3', 2)
        ]
    });

    const picked = pickGiftCards(npcPlayer, opponent, geishas);

    assert.deepEqual(picked.map(card => card.id), ['low', 'swing', 'mid']);
});

test('pickTradeOffCards chooses low sacrifice value and opponent denial cards', () => {
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5), makeGeisha(3, 3)];
    const npcPlayer = makePlayer({
        hand: [
            makeCard('npc-swing', 2),
            makeCard('opp-denial', 1),
            makeCard('small', 3)
        ],
        playedCards: [makeCard('npc-played', 2)]
    });
    const opponent = makePlayer({
        playedCards: [
            makeCard('opp-played-1', 1),
            makeCard('opp-played-2', 1),
            makeCard('opp-played-3', 2)
        ]
    });

    const picked = pickTradeOffCards(npcPlayer, opponent, geishas);

    assert.deepEqual(picked.map(card => card.id), ['opp-denial', 'small']);
});
