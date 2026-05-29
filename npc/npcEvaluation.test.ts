import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    applyCardsToSnapshot,
    buildGeishaCountSnapshot,
    evaluateSnapshot,
    getCardUtility
} from './npcEvaluation.js';

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

test('buildGeishaCountSnapshot counts played cards for NPC and opponent by geisha', () => {
    const snapshot = buildGeishaCountSnapshot(
        [makeGeisha(1, 2), makeGeisha(2, 5)],
        {
            playedCards: [
                makeCard('npc-1', 1),
                makeCard('npc-2', 2),
                makeCard('npc-3', 2)
            ]
        },
        {
            playedCards: [
                makeCard('opp-1', 1),
                makeCard('opp-2', 1)
            ]
        }
    );

    assert.deepEqual(snapshot.get(1), { npc: 1, opp: 2, charm: 2 });
    assert.deepEqual(snapshot.get(2), { npc: 2, opp: 0, charm: 5 });
});

test('getCardUtility preserves chase and swing scoring rules', () => {
    const snapshot = new Map([
        [1, { npc: 1, opp: 2, charm: 3 }],
        [2, { npc: 1, opp: 1, charm: 4 }],
        [3, { npc: 3, opp: 1, charm: 5 }]
    ]);

    assert.equal(getCardUtility(snapshot, 1, true), 6);
    assert.equal(getCardUtility(snapshot, 2, true), 16);
    assert.equal(getCardUtility(snapshot, 3, true), 5);
    assert.equal(getCardUtility(snapshot, 999, true), 0);
});

test('evaluateSnapshot returns NPC score advantage from snapshot counts', () => {
    const snapshot = new Map([
        [1, { npc: 2, opp: 1, charm: 2 }],
        [2, { npc: 0, opp: 2, charm: 5 }]
    ]);

    assert.equal(evaluateSnapshot(snapshot), -6);
});

test('applyCardsToSnapshot returns a new snapshot without mutating the original', () => {
    const snapshot = new Map([
        [1, { npc: 1, opp: 1, charm: 2 }],
        [2, { npc: 0, opp: 2, charm: 5 }]
    ]);

    const nextNpc = applyCardsToSnapshot(snapshot, [1, 2, 999], true);
    const nextOpponent = applyCardsToSnapshot(snapshot, [1], false);

    assert.notEqual(nextNpc, snapshot);
    assert.deepEqual(snapshot.get(1), { npc: 1, opp: 1, charm: 2 });
    assert.deepEqual(snapshot.get(2), { npc: 0, opp: 2, charm: 5 });
    assert.deepEqual(nextNpc.get(1), { npc: 2, opp: 1, charm: 2 });
    assert.deepEqual(nextNpc.get(2), { npc: 1, opp: 2, charm: 5 });
    assert.deepEqual(nextOpponent.get(1), { npc: 1, opp: 2, charm: 2 });
});
