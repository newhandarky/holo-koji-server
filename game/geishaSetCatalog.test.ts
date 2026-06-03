import test from 'node:test';
import assert from 'node:assert/strict';
import {
    charmPointsDistribution,
    collaborationCharacterPool,
    CUSTOM_SELECTION_SIZE,
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    geishaSetMetadata,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    hololiveCharacterPool,
    resolveAssetUrl,
    ROOM_SETUP_MODES,
    SUPPORTED_GEISHA_SETS
} from './geishaSetCatalog.js';

test('geisha set catalog exposes supported sets, setup modes and metadata', () => {
    assert.equal(DEFAULT_GEISHA_SET, 'default');
    assert.equal(DEFAULT_ROOM_SETUP_MODE, 'random');
    assert.equal(CUSTOM_SELECTION_SIZE, 7);
    assert.deepEqual([...SUPPORTED_GEISHA_SETS], ['default', 'collaboration', 'hololive']);
    assert.deepEqual([...ROOM_SETUP_MODES], ['random', 'custom']);
    assert.equal(geishaSetMetadata.default.label, 'Ginza');
    assert.equal(geishaSetMetadata.collaboration.label, '擅自合作系列');
    assert.equal(geishaSetMetadata.hololive.label, 'Hololive');
});

test('geisha set catalog exposes the existing character pools', () => {
    assert.ok(ginzaCharacterPool.length >= 7);
    assert.ok(collaborationCharacterPool.length >= 7);
    assert.ok(hololiveCharacterPool.length >= 7);
    assert.equal(ginzaCharacterPool[0]?.characterId, 'ginza-ema');
});

test('ginza board slot catalog keeps production charm distribution and item assets', () => {
    assert.equal(ginzaBoardSlotDefinitions.length, 7);
    assert.deepEqual(
        ginzaBoardSlotDefinitions.map((slot) => slot.charmPoints).sort((a, b) => a - b),
        [...charmPointsDistribution].sort((a, b) => a - b)
    );
    ginzaBoardSlotDefinitions.forEach((slot, index) => {
        assert.equal(slot.slotId, index + 1);
        assert.equal(slot.slotOrder, index);
        assert.ok(slot.itemAssetName);
        assert.ok(slot.itemImageUrl.startsWith('https://'));
        assert.ok(slot.itemIconUrl.startsWith('https://'));
    });
});

test('resolveAssetUrl preserves absolute urls and normalizes relative asset paths', () => {
    assert.equal(
        resolveAssetUrl('https://example.test/assets/card.png'),
        'https://example.test/assets/card.png'
    );
    assert.equal(
        resolveAssetUrl('/assets/card.png'),
        'https://newhandarky.github.io/holo-koji/assets/card.png'
    );
    assert.equal(
        resolveAssetUrl('assets/card.png'),
        'https://newhandarky.github.io/holo-koji/assets/card.png'
    );
    assert.equal(resolveAssetUrl(), '');
});
