import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import type { NpcStrategyPlayer } from './npcActionPlanner.js';
import {
    pickNpcCompetitionGroupResponse,
    pickNpcGiftCardResponse
} from './npcResponseStrategy.js';

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

test('pickNpcGiftCardResponse chooses random for easy and highest utility otherwise', () => {
    const offered = [
        makeCard('small', 1),
        makeCard('swing', 2)
    ];
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5)];
    const npcPlayer = makePlayer({
        playedCards: [makeCard('npc-played', 2)]
    });
    const opponent = makePlayer({
        playedCards: [makeCard('opp-played', 2)]
    });

    assert.equal(pickNpcGiftCardResponse(offered, 'easy', null, null, geishas, makeRandom([0]))?.id, 'small');
    assert.equal(pickNpcGiftCardResponse(offered, 'hard', npcPlayer, opponent, geishas)?.id, 'swing');
});

test('pickNpcGiftCardResponse falls back to first card without board context', () => {
    const offered = [
        makeCard('first', 1),
        makeCard('second', 2)
    ];

    assert.equal(pickNpcGiftCardResponse(offered, 'hard', null, null, [])?.id, 'first');
    assert.equal(pickNpcGiftCardResponse([], 'hard', null, null, []), null);
});

test('pickNpcCompetitionGroupResponse chooses the group with better NPC outcome', () => {
    const groups = [
        [makeCard('small', 1)],
        [makeCard('swing', 2), makeCard('extra', 1)]
    ];
    const geishas = [makeGeisha(1, 2), makeGeisha(2, 5)];
    const npcPlayer = makePlayer({
        playedCards: [makeCard('npc-played', 2)]
    });
    const opponent = makePlayer({
        playedCards: [makeCard('opp-played', 2)]
    });

    assert.equal(pickNpcCompetitionGroupResponse(groups, 'hard', npcPlayer, opponent, geishas), 1);
});

test('pickNpcCompetitionGroupResponse keeps easy random and invalid group behavior', () => {
    const groups = [
        [makeCard('a', 1)],
        [makeCard('b', 2)]
    ];

    assert.equal(pickNpcCompetitionGroupResponse(groups, 'easy', null, null, [], makeRandom([0.49])), 0);
    assert.equal(pickNpcCompetitionGroupResponse(groups, 'easy', null, null, [], makeRandom([0.5])), 1);
    assert.equal(pickNpcCompetitionGroupResponse([groups[0]], 'hard', null, null, []), null);
    assert.equal(pickNpcCompetitionGroupResponse(groups, 'hard', null, null, []), 0);
});
