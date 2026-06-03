import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeAccountSyncPayload,
    normalizeAchievementAcknowledgePayload
} from './accountMessagePayloads.js';

test('normalizeAccountSyncPayload keeps object payloads and replaces non-objects with empty request', () => {
    assert.deepEqual(normalizeAccountSyncPayload({
        idToken: 'id-token',
        profile: { displayName: 'Host' },
        lineUserId: 'client-supplied'
    }), {
        idToken: 'id-token',
        profile: { displayName: 'Host' },
        lineUserId: 'client-supplied'
    });
    assert.deepEqual(normalizeAccountSyncPayload(null), {});
    assert.deepEqual(normalizeAccountSyncPayload('invalid'), {});
});

test('normalizeAchievementAcknowledgePayload only returns an array achievementIds payload', () => {
    assert.deepEqual(normalizeAchievementAcknowledgePayload({
        achievementIds: ['first_win', 'not-valid-yet']
    }), {
        achievementIds: ['first_win', 'not-valid-yet']
    });
    assert.deepEqual(normalizeAchievementAcknowledgePayload({ achievementIds: 'first_win' }), {
        achievementIds: []
    });
    assert.deepEqual(normalizeAchievementAcknowledgePayload(null), {
        achievementIds: []
    });
});
