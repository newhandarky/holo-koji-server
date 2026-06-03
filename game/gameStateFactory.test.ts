import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDeckForGeishas,
    buildOpeningDealSummary,
    cloneGeishas,
    cloneGeishasForNextRound,
    createBaseGeishas,
    createCustomSelectedGeishas,
    createDeterministicRandomSource,
    createGameStateWithOrder,
    createPlayer,
    createRandomizedGeishas,
    createWaitingGameState,
    markOpeningDealNotReplayable
} from './gameStateFactory.js';

test('gameStateFactory barrel re-exports random and board factory helpers', () => {
    assert.equal(typeof createDeterministicRandomSource, 'function');
    assert.equal(typeof createBaseGeishas, 'function');
    assert.equal(typeof createRandomizedGeishas, 'function');
    assert.equal(typeof createCustomSelectedGeishas, 'function');
    assert.equal(typeof cloneGeishas, 'function');
    assert.equal(typeof cloneGeishasForNextRound, 'function');
});

test('gameStateFactory barrel re-exports deck and opening deal helpers', () => {
    assert.equal(typeof buildDeckForGeishas, 'function');
    assert.equal(typeof buildOpeningDealSummary, 'function');
    assert.equal(typeof markOpeningDealNotReplayable, 'function');
});

test('gameStateFactory barrel re-exports server state factory helpers', () => {
    assert.equal(typeof createPlayer, 'function');
    assert.equal(typeof createWaitingGameState, 'function');
    assert.equal(typeof createGameStateWithOrder, 'function');
});
