import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    AccountSyncResult,
    AchievementStatusResult,
    LineAccountProfile
} from '@newhandarky/hanakoji-game-types';
import {
    buildAccountStatusResult,
    sendAccountSyncResult,
    sendAchievementStatusResult
} from './accountMessageResponses.js';

type CapturedMessage = {
    type: string;
    payload?: unknown;
};

const makeProfile = (): LineAccountProfile => ({
    lineUserId: 'line-host',
    displayName: 'Host',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    counters: {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-01-02T00:00:00.000Z'
    }
});

const makeSocket = (): { ws: { send: (payload: string) => void }; messages: CapturedMessage[] } => {
    const messages: CapturedMessage[] = [];
    return {
        ws: {
            send: (payload: string) => {
                messages.push(JSON.parse(payload) as CapturedMessage);
            }
        },
        messages
    };
};

test('account response helpers preserve existing wire response types', () => {
    const socket = makeSocket();
    const syncResult: AccountSyncResult = {
        status: 'bound',
        profile: makeProfile(),
        persistenceStatus: {
            mode: 'durable',
            available: true,
            message: 'Account profiles are persistent.'
        }
    };
    const achievementResult: AchievementStatusResult = {
        status: 'guest',
        persistenceStatus: {
            mode: 'temporary',
            available: false,
            message: 'Achievements are unavailable.'
        },
        newUnlockCount: 0
    };

    sendAccountSyncResult(socket.ws, syncResult);
    sendAchievementStatusResult(socket.ws, achievementResult);

    assert.deepEqual(socket.messages, [
        { type: 'ACCOUNT_SYNC_RESULT', payload: syncResult },
        { type: 'ACHIEVEMENT_STATUS_RESULT', payload: achievementResult }
    ]);
});

test('buildAccountStatusResult preserves bound and guest status payload shape', () => {
    const persistenceStatus = {
        mode: 'durable' as const,
        available: true,
        message: 'Account profiles are persistent.'
    };
    const profile = makeProfile();

    assert.deepEqual(buildAccountStatusResult(profile, persistenceStatus), {
        status: 'bound',
        profile,
        persistenceStatus
    });
    assert.deepEqual(buildAccountStatusResult(null, persistenceStatus), {
        status: 'guest',
        persistenceStatus
    });
});
