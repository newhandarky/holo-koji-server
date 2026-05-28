import test from 'node:test';
import assert from 'node:assert/strict';
import type { AccountSyncResult, LineAccountProfile } from 'game-shared-types';
import type { AchievementMatchCompletionRequest, AchievementMatchCompletionResult } from './achievementStore.js';
import {
    buildPublicAccountProfile,
    createAccountStore,
    validateVerifiedLineIdentity
} from './accountStore.js';

const verifiedIdentity = {
    provider: 'line',
    lineUserId: 'U1234567890',
    verifiedAt: '2026-05-05T12:34:56.000Z',
    source: 'line-login-verification'
} as const;

const profile = {
    displayName: '銀座玩家',
    avatarUrl: 'https://example.test/avatar.png'
} as const;

const durablePersistenceStatus = {
    mode: 'durable',
    available: true,
    message: 'Account profiles are persistent.'
} as const;

const fixedClock = (iso: string) => () => new Date(iso);

const requireProfile = (result: AccountSyncResult): LineAccountProfile => {
    assert.ok(result.profile);
    return result.profile;
};

test('validateVerifiedLineIdentity rejects arbitrary or malformed identity claims', () => {
    assert.equal(validateVerifiedLineIdentity(null), null);
    assert.equal(validateVerifiedLineIdentity({ lineUserId: 'U1' }), null);
    assert.equal(validateVerifiedLineIdentity({ ...verifiedIdentity, provider: 'manual' }), null);
    assert.equal(validateVerifiedLineIdentity({ ...verifiedIdentity, verifiedAt: 'not-date' }), null);

    assert.deepEqual(validateVerifiedLineIdentity(verifiedIdentity), verifiedIdentity);
});

test('syncAccount creates one profile and preserves createdAt on re-sync', async () => {
    const firstNow = fixedClock('2026-05-05T12:00:00.000Z');
    const store = createAccountStore({ redisUrl: '', now: firstNow });

    const first = await store.syncVerifiedAccount({ verifiedIdentity, profile });
    assert.equal(first.status, 'bound');
    const firstProfile = requireProfile(first);
    assert.equal(firstProfile.lineUserId, 'U1234567890');
    assert.equal(firstProfile.displayName, '銀座玩家');
    assert.equal(firstProfile.avatarUrl, 'https://example.test/avatar.png');
    assert.equal(firstProfile.createdAt, '2026-05-05T12:00:00.000Z');
    assert.deepEqual(firstProfile.counters, {
        gamesPlayed: 0,
        wins: 0,
        lastPlayedAt: null
    });

    const second = await store.syncVerifiedAccount({
        verifiedIdentity,
        profile: {
            displayName: '銀座玩家 Updated',
            avatarUrl: 'https://example.test/new-avatar.png'
        }
    });

    assert.equal(second.status, 'bound');
    const secondProfile = requireProfile(second);
    assert.equal(secondProfile.createdAt, firstProfile.createdAt);
    assert.equal(secondProfile.displayName, '銀座玩家 Updated');
    assert.equal(secondProfile.updatedAt, '2026-05-05T12:00:00.000Z');
});

test('syncAccount rejects room payload lineUserId and frontend profile fields as account proof', async () => {
    const store = createAccountStore({ redisUrl: '' });

    const result = await store.syncAccount({
        lineUserId: 'spoofed-line-user',
        profile: {
            displayName: 'Spoof',
            avatarUrl: 'https://example.test/spoof.png'
        }
    });

    assert.equal(result.status, 'unverified');
    assert.equal(result.profile, undefined);
    assert.equal(await store.getProfile('spoofed-line-user'), undefined);
});

test('syncAccount rejects client submitted VerifiedLineIdentity unless the server marks it trusted', async () => {
    const store = createAccountStore({ redisUrl: '' });

    const untrusted = await store.syncAccount({ verifiedIdentity, profile });
    assert.equal(untrusted.status, 'unverified');
    assert.equal(await store.getProfile(verifiedIdentity.lineUserId), undefined);

    const trusted = await store.syncAccount({ verifiedIdentity, profile }, { trustedIdentity: true });
    assert.equal(trusted.status, 'bound');
    assert.equal(requireProfile(trusted).lineUserId, verifiedIdentity.lineUserId);
});


test('syncAccount rejects missing invalid VerifiedLineIdentity and keeps guest continuation result safe', async () => {
    const store = createAccountStore({ redisUrl: '' });

    const result = await store.syncAccount({
        verifiedIdentity: {
            provider: 'line',
            lineUserId: '',
            verifiedAt: 'bad-date',
            source: ''
        },
        profile
    });

    assert.equal(result.status, 'unverified');
    assert.match(result.guestNotice ?? '', /訪客模式/);
    assert.equal(result.persistenceStatus.mode, 'temporary');
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'rawProfile'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, 'token'), false);
});

test('bound-account match completion updates minimal counters only', async () => {
    const store = createAccountStore({ redisUrl: '', now: fixedClock('2026-05-05T12:00:00.000Z') });
    await store.syncVerifiedAccount({ verifiedIdentity, profile });

    const updated = await store.updateCountersForCompletedGame({
        lineUserId: verifiedIdentity.lineUserId,
        won: true,
        completedAt: '2026-05-05T14:00:00.000Z'
    });

    assert.ok(updated);
    assert.deepEqual(updated.counters, {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-05-05T14:00:00.000Z'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(updated, 'achievements'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(updated, 'unlockState'), false);
});

test('guest match completion does not update persistent account counters', async () => {
    const store = createAccountStore({ redisUrl: '' });

    const result = await store.recordMatchCompletion({
        completionId: 'guest:end',
        winner: 'guest',
        players: [
            { playerId: 'guest', name: 'Guest' },
            { playerId: 'npc', isNpc: true }
        ]
    });

    assert.deepEqual(result.accountProfiles, []);
    assert.deepEqual(result.achievements.updates, []);
});

test('recordMatchCompletion updates bound players only and caps wins by games played', async () => {
    const store = createAccountStore({ redisUrl: '', now: fixedClock('2026-05-05T12:00:00.000Z') });
    const sync = await store.syncVerifiedAccount({ verifiedIdentity, profile });
    const syncProfile = requireProfile(sync);

    const result = await store.recordMatchCompletion({
        completionId: 'room-1:end',
        winner: 'host',
        players: [
            { playerId: 'host', accountProfile: syncProfile },
            { playerId: 'guest' }
        ]
    });

    assert.equal(result.accountProfiles.length, 1);
    assert.deepEqual(result.accountProfiles[0].counters, {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-05-05T12:00:00.000Z'
    });
});

test('recordMatchCompletion updates account counters and achievement progress from one completion', async () => {
    const achievementCalls: AchievementMatchCompletionRequest[] = [];
    const achievementStore = {
        recordMatchCompletion: async (event: AchievementMatchCompletionRequest = {}): Promise<AchievementMatchCompletionResult> => {
            achievementCalls.push(event);
            const lineUserId = event.players?.[0]?.accountProfile?.lineUserId ?? '';
            const completionId = event.completionId ?? '';
            const updatedAt = event.completedAt ?? '2026-05-05T12:00:00.000Z';
            return {
                status: 'available' as const,
                completionId,
                persistenceStatus: durablePersistenceStatus,
                updates: [
                    {
                        lineUserId,
                        achievementId: 'first_completed_match' as const,
                        currentValue: 1,
                        target: 1,
                        updatedAt
                    }
                ]
            };
        }
    };
    const store = createAccountStore({
        redisUrl: '',
        now: fixedClock('2026-05-05T12:00:00.000Z'),
        achievementStore
    });
    const sync = await store.syncVerifiedAccount({ verifiedIdentity, profile });
    const syncProfile = requireProfile(sync);

    const result = await store.recordMatchCompletion({
        completionId: 'room-1:end',
        winner: 'host',
        players: [
            { playerId: 'host', accountProfile: syncProfile }
        ]
    });

    assert.equal(achievementCalls.length, 1);
    assert.equal(achievementCalls[0].completionId, 'room-1:end');
    assert.equal(achievementCalls[0].completedAt, '2026-05-05T12:00:00.000Z');
    assert.equal(result.accountProfiles[0].counters.gamesPlayed, 1);
    assert.equal(result.achievements.updates[0].achievementId, 'first_completed_match');
});

test('recordMatchCompletion ignores repeated completionId for account counters and achievements', async () => {
    const achievementCalls: AchievementMatchCompletionRequest[] = [];
    const achievementStore = {
        recordMatchCompletion: async (event: AchievementMatchCompletionRequest = {}): Promise<AchievementMatchCompletionResult> => {
            achievementCalls.push(event);
            const lineUserId = event.players?.[0]?.accountProfile?.lineUserId ?? '';
            const completionId = event.completionId ?? '';
            const updatedAt = event.completedAt ?? '2026-05-05T12:00:00.000Z';
            return {
                status: 'available' as const,
                completionId,
                persistenceStatus: durablePersistenceStatus,
                updates: [
                    {
                        lineUserId,
                        achievementId: 'first_completed_match' as const,
                        currentValue: 1,
                        target: 1,
                        updatedAt
                    }
                ]
            };
        }
    };
    const store = createAccountStore({
        redisUrl: '',
        now: fixedClock('2026-05-05T12:00:00.000Z'),
        achievementStore
    });
    const sync = await store.syncVerifiedAccount({ verifiedIdentity, profile });
    const syncProfile = requireProfile(sync);

    await store.recordMatchCompletion({
        completionId: 'room-duplicate:end',
        winner: 'host',
        players: [
            { playerId: 'host', accountProfile: syncProfile }
        ]
    });
    const repeated = await store.recordMatchCompletion({
        completionId: 'room-duplicate:end',
        winner: 'host',
        players: [
            { playerId: 'host', accountProfile: syncProfile }
        ]
    });
    const profileAfterRepeat = await store.getProfile(verifiedIdentity.lineUserId);

    assert.ok(profileAfterRepeat);
    assert.equal(achievementCalls.length, 1);
    assert.deepEqual(repeated.accountProfiles, []);
    assert.deepEqual(repeated.achievements.updates, []);
    assert.deepEqual(profileAfterRepeat.counters, {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-05-05T12:00:00.000Z'
    });
});

test('persistence status distinguishes temporary and durable modes without secrets', () => {
    const temporary = createAccountStore({ redisUrl: '' });
    assert.deepEqual(temporary.getPersistenceStatus(), {
        mode: 'temporary',
        available: true,
        message: 'Account profiles are temporary in this environment.'
    });

    const unconfirmedRedis = createAccountStore({ redisUrl: 'redis://example.invalid:6379' });
    assert.deepEqual(unconfirmedRedis.getPersistenceStatus(), {
        mode: 'temporary',
        available: false,
        message: 'Account profiles are unavailable; durable persistence is not connected.'
    });

    const durable = createAccountStore({
        redisClient: {
            isOpen: true,
            get: async () => null,
            set: async () => undefined
        }
    });

    assert.deepEqual(durable.getPersistenceStatus(), {
        mode: 'durable',
        available: true,
        message: 'Account profiles are persistent.'
    });
    assert.equal(Object.prototype.hasOwnProperty.call(durable.getPersistenceStatus(), 'redisUrl'), false);
});

test('checkPersistenceStatus confirms Redis availability before reporting durable', async () => {
    const redisClient = {
        isOpen: false,
        connect: async function connect() {
            this.isOpen = true;
        },
        get: async () => null,
        set: async () => undefined
    };
    const store = createAccountStore({ redisClient });

    assert.deepEqual(store.getPersistenceStatus(), {
        mode: 'temporary',
        available: false,
        message: 'Account profiles are unavailable; durable persistence is not connected.'
    });

    assert.deepEqual(await store.checkPersistenceStatus(), {
        mode: 'durable',
        available: true,
        message: 'Account profiles are persistent.'
    });
});

test('checkPersistenceStatus reports unavailable when Redis connection confirmation fails', async () => {
    const store = createAccountStore({
        redisClient: {
            isOpen: false,
            connect: async () => {
                throw new Error('connect failed');
            },
            get: async () => null,
            set: async () => undefined
        }
    });

    assert.deepEqual(await store.checkPersistenceStatus(), {
        mode: 'temporary',
        available: false,
        message: 'Account profiles are unavailable; durable persistence is not connected.'
    });
});

test('persistence status does not report durable when Redis operations fail', async () => {
    const store = createAccountStore({
        redisClient: {
            isOpen: true,
            get: async () => {
                throw new Error('redis unavailable');
            },
            set: async () => undefined
        }
    });

    const result = await store.syncAccount({ verifiedIdentity, profile }, { trustedIdentity: true });

    assert.equal(result.status, 'sync-failed');
    assert.deepEqual(result.persistenceStatus, {
        mode: 'temporary',
        available: false,
        message: 'Account profiles are unavailable; durable persistence is not connected.'
    });
    assert.deepEqual(store.getPersistenceStatus(), result.persistenceStatus);
});

test('public projection strips private account fields', () => {
    const publicProfile = buildPublicAccountProfile({
        lineUserId: 'U1234567890',
        displayName: '銀座玩家',
        avatarUrl: 'https://example.test/avatar.png',
        createdAt: '2026-05-05T12:00:00.000Z',
        updatedAt: '2026-05-05T12:00:00.000Z',
        token: 'secret',
        rawProfile: { userId: 'U1234567890' },
        counters: {
            gamesPlayed: 3,
            wins: 2,
            lastPlayedAt: '2026-05-05T14:00:00.000Z'
        }
    } as unknown as Parameters<typeof buildPublicAccountProfile>[0]);

    assert.deepEqual(publicProfile, {
        lineUserId: 'U1234567890',
        displayName: '銀座玩家',
        avatarUrl: 'https://example.test/avatar.png',
        createdAt: '2026-05-05T12:00:00.000Z',
        updatedAt: '2026-05-05T12:00:00.000Z',
        counters: {
            gamesPlayed: 3,
            wins: 2,
            lastPlayedAt: '2026-05-05T14:00:00.000Z'
        }
    });
});
