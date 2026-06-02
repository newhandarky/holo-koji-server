import test from 'node:test';
import assert from 'node:assert/strict';
import type { ItemCard } from '@newhandarky/hanakoji-game-types';
import { createPlayer } from './gameStateFactory.js';
import {
    buildPlayerVisibleGameState,
    createHiddenCards,
    sanitizePendingInteractionForViewer
} from './playerVisibleState.js';
import type { ServerGameState } from '../utils/gameUtils.js';

const makeCard = (id: string, geishaId = 1): ItemCard => ({
    id,
    geishaId,
    type: 'item'
});

const makeState = (): ServerGameState => {
    const viewer = createPlayer('viewer', { name: 'Viewer' });
    const opponent = createPlayer('opponent', { name: 'Opponent' });
    viewer.hand.push(makeCard('viewer-hand-1'));
    viewer.secretCards.push(makeCard('viewer-secret-1'));
    viewer.discardedCards.push(makeCard('viewer-discard-1'));
    opponent.hand.push(makeCard('opponent-hand-1'), makeCard('opponent-hand-2'));
    opponent.secretCards.push(makeCard('opponent-secret-1'));
    opponent.discardedCards.push(makeCard('opponent-discard-1'));

    return {
        gameId: 'visible-state-room',
        hostId: 'viewer',
        players: [viewer, opponent],
        geishas: [],
        geishaSet: 'default',
        currentPlayer: 0,
        phase: 'playing',
        round: 1,
        winner: null,
        orderDecision: {
            isOpen: false,
            phase: 'result',
            players: ['viewer', 'opponent'],
            result: {
                firstPlayer: 'viewer',
                secondPlayer: 'opponent',
                order: ['viewer', 'opponent']
            },
            confirmations: ['viewer', 'opponent'],
            waitingFor: []
        },
        drawPile: [makeCard('draw-hidden')],
        discardPile: [],
        removedCard: makeCard('removed-hidden'),
        openingDeal: undefined,
        settlement: undefined,
        pendingInteraction: null,
        lastAction: undefined
    };
};

test('hidden card helper creates stable hidden placeholders without real identity', () => {
    assert.deepEqual(createHiddenCards(2, 'opponent-hand'), [
        { id: 'hidden-opponent-hand-0', geishaId: 0, type: 'hidden' },
        { id: 'hidden-opponent-hand-1', geishaId: 0, type: 'hidden' }
    ]);
});

test('player-visible state masks opponent hand, secret cards, discarded cards, draw pile, and removed card', () => {
    const state = makeState();

    const visible = buildPlayerVisibleGameState(state, 'viewer');

    assert.ok(visible);
    assert.deepEqual(visible.drawPile, []);
    assert.equal(visible.removedCard, null);
    assert.equal(JSON.stringify(visible).includes('removed-hidden'), false);

    const viewer = visible.players.find((player) => player.id === 'viewer');
    const opponent = visible.players.find((player) => player.id === 'opponent');
    assert.ok(viewer);
    assert.ok(opponent);
    assert.deepEqual(viewer.hand, state.players[0].hand);
    assert.deepEqual(viewer.secretCards, state.players[0].secretCards);
    assert.equal(opponent.hand.length, 2);
    assert.equal(opponent.hand.every((card) => card.type === 'hidden'), true);
    assert.deepEqual(opponent.secretCards, []);
    assert.equal(opponent.discardedCards.length, 1);
    assert.equal(opponent.discardedCards[0].type, 'hidden');
    assert.equal(JSON.stringify(visible).includes('"id":"opponent-hand-1"'), false);
    assert.equal(JSON.stringify(visible).includes('"id":"opponent-secret-1"'), false);
    assert.equal(JSON.stringify(visible).includes('"id":"opponent-discard-1"'), false);
});

test('active player-visible state redacts stale settlement removed card', () => {
    const state = makeState();
    state.settlement = { removedCard: state.removedCard };

    const visible = buildPlayerVisibleGameState(state, 'viewer');

    assert.ok(visible);
    assert.equal(visible.settlement, undefined);
    assert.equal(JSON.stringify(visible).includes('removed-hidden'), false);
});

test('ended player-visible state exposes removed card only through settlement', () => {
    const state = makeState();
    state.phase = 'ended';
    state.settlement = { removedCard: state.removedCard };

    const visible = buildPlayerVisibleGameState(state, 'viewer');

    assert.ok(visible);
    assert.equal(visible.removedCard, null);
    assert.deepEqual(visible.settlement?.removedCard, state.removedCard);
});

test('player-visible state applies fallback geisha set when room state does not include one', () => {
    const state = makeState();
    delete state.geishaSet;

    const visible = buildPlayerVisibleGameState(state, 'viewer', { geishaSet: 'hololive' });

    assert.ok(visible);
    assert.equal(visible.geishaSet, 'hololive');
});

test('pending interactions are fully visible only to the responding player', () => {
    const offeredCards = [
        makeCard('gift-1', 1),
        makeCard('gift-2', 2),
        makeCard('gift-3', 3)
    ];
    const giftPending = {
        type: 'GIFT_SELECTION' as const,
        initiatorId: 'viewer',
        targetPlayerId: 'opponent',
        offeredCards
    };

    assert.deepEqual(
        sanitizePendingInteractionForViewer(giftPending, 'opponent'),
        giftPending
    );
    assert.deepEqual(
        sanitizePendingInteractionForViewer(giftPending, 'viewer'),
        { ...giftPending, offeredCards: [] }
    );

    const competitionPending = {
        type: 'COMPETITION_SELECTION' as const,
        initiatorId: 'viewer',
        targetPlayerId: 'opponent',
        groups: [[offeredCards[0], offeredCards[1]], [offeredCards[2], offeredCards[0]]]
    };

    assert.deepEqual(
        sanitizePendingInteractionForViewer(competitionPending, 'opponent'),
        competitionPending
    );
    assert.deepEqual(
        sanitizePendingInteractionForViewer(competitionPending, 'viewer'),
        { ...competitionPending, groups: [] }
    );
});

test('non-response pending interactions are hidden from non-target viewers', () => {
    const pendingInteraction = {
        type: 'UNKNOWN_TEST_INTERACTION',
        initiatorId: 'viewer',
        targetPlayerId: 'opponent'
    } as unknown as NonNullable<ServerGameState['pendingInteraction']>;

    assert.deepEqual(
        sanitizePendingInteractionForViewer(pendingInteraction, 'opponent'),
        pendingInteraction
    );
    assert.equal(sanitizePendingInteractionForViewer(pendingInteraction, 'viewer'), null);
});
