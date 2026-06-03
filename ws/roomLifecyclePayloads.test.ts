import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CUSTOM_SELECTION_ERROR_MESSAGE,
    LEGACY_GEISHA_SET_ERROR_MESSAGE
} from '../rooms/roomErrors.js';
import {
    parseCreateRoomPayload,
    parseJoinRoomPayload
} from './roomLifecyclePayloads.js';

test('parseCreateRoomPayload preserves validation errors and normalizes create options', () => {
    assert.deepEqual(parseCreateRoomPayload({}), {
        ok: false,
        error: { message: '缺少 playerId' }
    });
    assert.deepEqual(parseCreateRoomPayload({ playerId: 'host', geishaSet: 'legacy' }), {
        ok: false,
        error: { message: LEGACY_GEISHA_SET_ERROR_MESSAGE }
    });
    assert.deepEqual(parseCreateRoomPayload({ playerId: 'host', setupMode: 'draft' }), {
        ok: false,
        error: { message: CUSTOM_SELECTION_ERROR_MESSAGE }
    });

    const result = parseCreateRoomPayload({
        playerId: 'host',
        mode: 'npc',
        aiDifficulty: 'hell',
        geishaSet: 'hololive',
        setupMode: 'custom',
        customSelection: { characterIds: ['a'] }
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }
    assert.equal(result.value.playerId, 'host');
    assert.equal(result.value.mode, 'npc');
    assert.equal(result.value.aiDifficulty, 'hell');
    assert.equal(result.value.requestedGeishaSet, 'hololive');
    assert.equal(result.value.setupMode, 'custom');
    assert.equal(result.value.rawPayload.customSelection?.characterIds?.[0], 'a');
});

test('parseJoinRoomPayload preserves missing room/player error and meta payload', () => {
    assert.deepEqual(parseJoinRoomPayload({ roomId: 'ROOM01' }), {
        ok: false,
        error: { message: '缺少 roomId 或 playerId', code: 'INVALID_JOIN_REQUEST' }
    });

    const result = parseJoinRoomPayload({
        roomId: 'ROOM01',
        playerId: 'guest',
        roomSessionToken: 'token'
    });

    assert.equal(result.ok, true);
    if (!result.ok) {
        return;
    }
    assert.equal(result.value.roomId, 'ROOM01');
    assert.equal(result.value.playerId, 'guest');
    assert.equal(result.value.rawPayload.roomSessionToken, 'token');
});
