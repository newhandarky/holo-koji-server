import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createDeterministicRandomSource,
    normalizeRandomSource
} from './gameRandomSource.js';

test('deterministic random source cycles integers and emits stable tokens', () => {
    const randomSource = createDeterministicRandomSource([3, -4]);

    assert.equal(randomSource.nextInt(7), 3);
    assert.equal(randomSource.nextInt(7), 4);
    assert.equal(randomSource.nextToken(), 'seed0003');
    assert.equal(randomSource.nextToken(), 'seed0004');
});

test('normalizeRandomSource fills missing methods without replacing provided hooks', () => {
    const randomSource = normalizeRandomSource({
        nextInt: () => 2
    });

    assert.equal(randomSource.nextInt(10), 2);
    assert.equal(typeof randomSource.nextToken(), 'string');
});
