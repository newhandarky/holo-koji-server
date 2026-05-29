import test from 'node:test';
import assert from 'node:assert/strict';
import type { ActionType, Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    buildNpcActionChoice,
    buildNpcRandomGroups,
    pickCompetitionCards,
    pickNpcCompetitionGroupResponse,
    pickNpcGiftCardResponse,
    pickRandomCards,
    pickTradeOffCards,
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
