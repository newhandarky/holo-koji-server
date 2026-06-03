import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_GEISHA_SET,
    ginzaBoardSlotDefinitions,
    isSupportedGeishaSet,
    normalizeRoomSetupMode,
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    validateCustomCharacterSelection
} from './geishaSetRules.js';

test('geishaSetRules barrel re-exports catalog symbols', () => {
    assert.equal(DEFAULT_GEISHA_SET, 'default');
    assert.equal(ginzaBoardSlotDefinitions.length, 7);
});

test('geishaSetRules barrel re-exports setup validation helpers', () => {
    assert.equal(isSupportedGeishaSet('hololive'), true);
    assert.equal(normalizeRoomSetupMode(undefined), 'random');
    assert.equal(typeof validateCustomCharacterSelection, 'function');
});

test('geishaSetRules barrel re-exports restore board helpers', () => {
    assert.equal(typeof resolveRestorableGeishaSet, 'function');
    assert.equal(typeof resolveRestorableBoardForSet, 'function');
});
