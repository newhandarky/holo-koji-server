import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGameActionPayload } from './gameMessagePayloads.js';

test('parseGameActionPayload accepts valid action type and object payload', () => {
    const result = parseGameActionPayload({
        action: {
            type: 'PLAY_SECRET',
            payload: {
                playerId: 'host',
                cardId: 'card-1'
            }
        }
    });

    assert.deepEqual(result, {
        ok: true,
        action: {
            type: 'PLAY_SECRET',
            payload: {
                playerId: 'host',
                cardId: 'card-1'
            }
        }
    });
});

test('parseGameActionPayload omits non-object nested action payload', () => {
    const result = parseGameActionPayload({
        action: {
            type: 'PLAY_SECRET',
            payload: 'not-an-object'
        }
    });

    assert.deepEqual(result, {
        ok: true,
        action: { type: 'PLAY_SECRET' }
    });
});

test('parseGameActionPayload rejects missing action object or action type', () => {
    assert.deepEqual(parseGameActionPayload({}), { ok: false });
    assert.deepEqual(parseGameActionPayload({ action: {} }), { ok: false });
    assert.deepEqual(parseGameActionPayload(null), { ok: false });
});
