import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    buildDeckForGeishas,
    buildPlayerVisibleGameState,
    createDeterministicRandomSource,
    createPlayer,
    createRandomizedGeishas,
    DEFAULT_GEISHA_SET,
    ginzaBoardSlotDefinitions,
    isSupportedGeishaSet,
    normalizeRoomSetupMode,
    sanitizePendingInteractionForViewer
} from './gameUtils.js';

test('gameUtils compatibility barrel re-exports geisha set rules', () => {
    assert.equal(DEFAULT_GEISHA_SET, 'default');
    assert.equal(isSupportedGeishaSet('hololive'), true);
    assert.equal(normalizeRoomSetupMode('custom'), 'custom');
    assert.equal(ginzaBoardSlotDefinitions.length, 7);
});

test('gameUtils compatibility barrel re-exports game state factory helpers', () => {
    const geishas = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    const { deck, removedCard } = buildDeckForGeishas(geishas, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });

    assert.equal(geishas.length, 7);
    assert.equal(deck.length + (removedCard ? 1 : 0), 21);
});

test('gameUtils compatibility barrel re-exports viewer projection helpers', () => {
    const viewer = createPlayer('viewer');
    const opponent = createPlayer('opponent');
    viewer.hand.push({ id: 'viewer-card', geishaId: 1, type: 'item' });
    opponent.hand.push({ id: 'opponent-card', geishaId: 2, type: 'item' });
    const state = {
        gameId: 'compat-room',
        players: [viewer, opponent],
        geishas: [],
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
        drawPile: [{ id: 'draw-hidden', geishaId: 3, type: 'item' }],
        discardPile: [],
        removedCard: { id: 'removed-hidden', geishaId: 4, type: 'item' },
        pendingInteraction: {
            type: 'GIFT_SELECTION',
            initiatorId: 'viewer',
            targetPlayerId: 'opponent',
            offeredCards: [{ id: 'gift-hidden', geishaId: 5, type: 'item' }]
        }
    } as ServerGameState;

    const visible = buildPlayerVisibleGameState(state, 'viewer');

    assert.ok(visible);
    assert.deepEqual(visible.drawPile, []);
    assert.equal(visible.removedCard, null);
    assert.equal(visible.players[1].hand[0].type, 'hidden');
    assert.deepEqual(
        sanitizePendingInteractionForViewer(state.pendingInteraction, 'viewer'),
        {
            type: 'GIFT_SELECTION',
            initiatorId: 'viewer',
            targetPlayerId: 'opponent',
            offeredCards: []
        }
    );
});
