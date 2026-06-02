import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildReadyCheckState,
    buildRematchConfirmationUpdate
} from './matchConfirmationFlow.js';

test('buildRematchConfirmationUpdate adds confirmations and reports waiting players', () => {
    const existing = new Set(['host']);
    const update = buildRematchConfirmationUpdate(['host', 'guest'], existing, 'host');

    assert.equal(update.added, false);
    assert.deepEqual(update.confirmations, ['host']);
    assert.deepEqual(update.waitingFor, ['guest']);
    assert.equal(update.shouldStartRematch, false);
    assert.deepEqual(Array.from(existing), ['host']);
});

test('buildRematchConfirmationUpdate automatically confirms npc rematches', () => {
    const update = buildRematchConfirmationUpdate(['host', 'NPC'], [], 'host', 'NPC');

    assert.deepEqual(update.confirmations, ['host', 'NPC']);
    assert.deepEqual(update.waitingFor, []);
    assert.equal(update.shouldStartRematch, true);
});

test('buildReadyCheckState creates an immutable empty confirmation state', () => {
    const playerIds = ['host', 'guest'];
    const state = buildReadyCheckState(playerIds);

    assert.deepEqual(state, {
        confirmations: [],
        waitingFor: ['host', 'guest']
    });
    assert.deepEqual(playerIds, ['host', 'guest']);
});
