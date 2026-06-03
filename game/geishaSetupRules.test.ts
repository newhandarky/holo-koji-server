import test from 'node:test';
import assert from 'node:assert/strict';
import type { CharacterProfile } from '@newhandarky/hanakoji-game-types';
import {
    collaborationCharacterPool,
    ginzaBoardSlotDefinitions,
    hololiveCharacterPool
} from './geishaSetCatalog.js';
import {
    getCharacterPoolForSet,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode,
    validateCharacterSetData,
    validateCustomCharacterSelection,
    validateGinzaSetupData
} from './geishaSetupRules.js';

test('setup rules normalize supported sets and reject unsupported sets', () => {
    assert.equal(normalizeGeishaSet(undefined), 'default');
    assert.equal(normalizeGeishaSet(null), 'default');
    assert.equal(normalizeGeishaSet('hololive'), 'hololive');
    assert.equal(isSupportedGeishaSet('collaboration'), true);
    assert.equal(isSupportedGeishaSet('akatsuki'), false);
    assert.equal(getCharacterPoolForSet('collaboration'), collaborationCharacterPool);
    assert.throws(
        () => getCharacterPoolForSet('akatsuki'),
        /Unsupported geisha set: akatsuki/
    );
});

test('setup rules normalize setup modes and reject invalid values', () => {
    assert.equal(normalizeRoomSetupMode(undefined), 'random');
    assert.equal(normalizeRoomSetupMode(null), 'random');
    assert.equal(normalizeRoomSetupMode(''), 'random');
    assert.equal(normalizeRoomSetupMode('custom'), 'custom');
    assert.throws(
        () => normalizeRoomSetupMode('draft'),
        /Unsupported room setup mode: draft/
    );
});

test('character set validation rejects incomplete and duplicate records', () => {
    const validPool = hololiveCharacterPool.slice(0, 7);
    assert.doesNotThrow(() => validateCharacterSetData('hololive', validPool));

    assert.throws(
        () => validateCharacterSetData('hololive', validPool.slice(0, 6)),
        /must contain at least seven/
    );
    assert.throws(
        () => validateCharacterSetData('hololive', [
            ...validPool.slice(0, 6),
            { ...validPool[0]! }
        ]),
        /Duplicate geisha characterId/
    );
    assert.throws(
        () => validateCharacterSetData('hololive', [
            ...validPool.slice(0, 6),
            { ...validPool[6]!, imageUrl: '' } as CharacterProfile
        ]),
        /must include characterId, name, and imageUrl/
    );
});

test('ginza setup validation keeps board slot data invariants', () => {
    assert.doesNotThrow(() => validateGinzaSetupData(undefined, ginzaBoardSlotDefinitions));
    assert.throws(
        () => validateGinzaSetupData(undefined, [{ ...ginzaBoardSlotDefinitions[0]! }]),
        /exactly seven/
    );
    assert.throws(
        () => validateGinzaSetupData(undefined, [
            { ...ginzaBoardSlotDefinitions[0]! },
            { ...ginzaBoardSlotDefinitions[1]!, slotId: ginzaBoardSlotDefinitions[0]!.slotId },
            ...ginzaBoardSlotDefinitions.slice(2)
        ]),
        /Duplicate Ginza slotId/
    );
});

test('custom character selection keeps exact unique ids inside the selected set', () => {
    const selectedIds = hololiveCharacterPool.slice(0, 7).map((character) => character.characterId);

    assert.deepEqual(
        validateCustomCharacterSelection('hololive', { characterIds: selectedIds }),
        { characterIds: selectedIds }
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: selectedIds.slice(0, 6) }),
        /exactly 7/
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: [...selectedIds.slice(0, 6), selectedIds[0]!] }),
        /unique/
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: [...selectedIds.slice(0, 6), 'missing'] }),
        /outside the selected set/
    );
});
