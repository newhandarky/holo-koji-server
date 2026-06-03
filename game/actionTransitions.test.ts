import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applySecretAction,
    applyTradeOffAction,
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from './actionTransitions.js';

test('actionTransitions barrel re-exports active action transitions', () => {
    assert.equal(typeof applySecretAction, 'function');
    assert.equal(typeof applyTradeOffAction, 'function');
});

test('actionTransitions barrel re-exports interaction action transitions', () => {
    assert.equal(typeof initiateGiftAction, 'function');
    assert.equal(typeof resolveGiftAction, 'function');
    assert.equal(typeof initiateCompetitionAction, 'function');
    assert.equal(typeof resolveCompetitionAction, 'function');
});
