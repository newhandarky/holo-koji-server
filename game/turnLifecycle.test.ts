import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    ActionType,
    ItemCard,
    Player
} from '@newhandarky/hanakoji-game-types';
import {
    advanceToNextTurn,
    prepareCurrentTurn,
    revealSecretCards,
    type TurnLifecycleState
} from './turnLifecycle.js';

const makeCard = (id: string): ItemCard => ({
    id,
    geishaId: 1,
    type: 'item'
});

const makePlayer = (id: string): Player => ({
    id,
    name: id,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as ActionType[])
        .map(type => ({ type, used: false })),
    score: { charm: 0, tokens: 0 }
});

const makeState = (): TurnLifecycleState => ({
    players: [makePlayer('player-a'), makePlayer('player-b')],
    currentPlayer: 0,
    drawPile: [makeCard('draw-1'), makeCard('draw-2')],
    phase: 'resolution',
    pendingInteraction: {
        type: 'GIFT_SELECTION',
        initiatorId: 'player-b',
        targetPlayerId: 'player-a',
        offeredCards: [makeCard('offered')]
    },
    lastAction: {
        playerId: 'player-b',
        action: 'gift'
    }
});

test('prepareCurrentTurn draws the top card and clears transient turn state without mutating input', () => {
    const state = makeState();
    const snapshot = structuredClone(state);

    const result = prepareCurrentTurn(state);

    assert.equal(result.outcome.type, 'drawn-card');
    if (result.outcome.type !== 'drawn-card') return;
    assert.equal(result.outcome.card.id, 'draw-1');
    assert.deepEqual(result.gameState.players[0]?.hand.map(card => card.id), ['draw-1']);
    assert.deepEqual(result.gameState.drawPile.map(card => card.id), ['draw-2']);
    assert.equal(result.gameState.phase, 'playing');
    assert.equal(result.gameState.pendingInteraction, null);
    assert.equal(result.gameState.lastAction, undefined);
    assert.deepEqual(state, snapshot);
});

test('prepareCurrentTurn allows a turn to start when the draw pile is empty', () => {
    const state = makeState();
    state.drawPile = [];

    const result = prepareCurrentTurn(state);

    assert.deepEqual(result.outcome, {
        type: 'empty-draw-pile',
        playerId: 'player-a'
    });
    assert.equal(result.gameState.phase, 'playing');
    assert.deepEqual(result.gameState.players[0]?.hand, []);
});

test('prepareCurrentTurn skips players whose tokens are exhausted', () => {
    const state = makeState();
    state.players[0]?.actionTokens.forEach(token => {
        token.used = true;
    });
    const snapshot = structuredClone(state);

    const result = prepareCurrentTurn(state);

    assert.deepEqual(result.outcome, {
        type: 'skip-player',
        playerId: 'player-a'
    });
    assert.deepEqual(state, snapshot);
});

test('advanceToNextTurn skips exhausted players and selects the next available player', () => {
    const state = makeState();
    state.currentPlayer = 1;
    state.players[0]?.actionTokens.forEach(token => {
        token.used = true;
    });

    const result = advanceToNextTurn(state);

    assert.deepEqual(result.outcome, {
        type: 'next-player',
        playerId: 'player-b',
        playerIndex: 1
    });
    assert.equal(result.gameState.currentPlayer, 1);
});

test('advanceToNextTurn requests round resolution when all tokens are exhausted', () => {
    const state = makeState();
    state.players.forEach(player => {
        player.actionTokens.forEach(token => {
            token.used = true;
        });
    });
    const snapshot = structuredClone(state);

    const result = advanceToNextTurn(state);

    assert.deepEqual(result.outcome, { type: 'resolve-round' });
    assert.deepEqual(state, snapshot);
});

test('revealSecretCards moves secret cards into played cards without mutating input', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];
    players[0]?.playedCards.push(makeCard('played'));
    players[0]?.secretCards.push(makeCard('secret'));
    const snapshot = structuredClone(players);

    const result = revealSecretCards(players);

    assert.deepEqual(result[0]?.playedCards.map(card => card.id), ['played', 'secret']);
    assert.deepEqual(result[0]?.secretCards, []);
    assert.deepEqual(players, snapshot);
});
