import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionType, Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    buildNpcActionChoice,
    pickBestNpcAction,
    type NpcStrategyPlayer
} from './npcActionPlanner.js';

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

test('buildNpcActionChoice keeps existing difficulty action preferences', () => {
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
    const opponent = makePlayer();

    const action = buildNpcActionChoice(npcPlayer, opponent, geishas, 'medium', makeRandom([0]));

    assert.equal(action?.type, 'INITIATE_COMPETITION');
});

test('buildNpcActionChoice uses expert scoring instead of random candidate order', () => {
    const geishas = [makeGeisha(1, 5), makeGeisha(2, 1)];
    const npcPlayer = makePlayer({
        actionTokens: [
            { type: 'secret', used: false },
            { type: 'trade-off', used: false }
        ],
        hand: [
            makeCard('valuable-secret', 1),
            makeCard('low-sacrifice', 2)
        ]
    });
    const opponent = makePlayer();

    const action = buildNpcActionChoice(npcPlayer, opponent, geishas, 'expert', makeRandom([0.75]));

    assert.deepEqual(action, {
        type: 'PLAY_SECRET',
        payload: { cardId: 'valuable-secret' }
    });
});

test('pickBestNpcAction returns null without candidates and chooses scoring winner otherwise', () => {
    const geishas = [makeGeisha(1, 5), makeGeisha(2, 1)];
    const npcPlayer = makePlayer({
        hand: [
            makeCard('valuable-secret', 1),
            makeCard('low-sacrifice', 2)
        ],
        playedCards: []
    });
    const opponent = makePlayer();

    assert.equal(pickBestNpcAction(npcPlayer, opponent, geishas, []), null);
    assert.equal(pickBestNpcAction(npcPlayer, opponent, geishas, ['secret', 'trade-off']), 'secret');
});
