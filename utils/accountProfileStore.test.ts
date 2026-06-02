import test from 'node:test';
import assert from 'node:assert/strict';
import type { AccountSyncResult, LineAccountProfile } from '@newhandarky/hanakoji-game-types';
import {
    buildPublicAccountProfile,
    createAccountProfileStore,
    validateVerifiedLineIdentity
} from './accountProfileStore.js';
import { createJsonPersistenceAdapter } from './persistenceAdapter.js';

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

const fixedClock = (iso: string) => () => new Date(iso);

const requireProfile = (result: AccountSyncResult): LineAccountProfile => {
    assert.ok(result.profile);
    return result.profile;
};

const createProfileStore = (now = fixedClock('2026-05-05T12:00:00.000Z')) => {
    const persistence = createJsonPersistenceAdapter({
        redisUrl: '',
        redisClient: null,
        logLabel: 'AccountProfileTest',
        durableMessage: 'Account profiles are persistent.',
        temporaryMessage: 'Account profiles are temporary in this environment.',
        unavailableMessage: 'Account profiles are unavailable; durable persistence is not connected.'
    });
    return createAccountProfileStore({
        persistence,
        accountKeyPrefix: 'test:account:',
        guestNotice: 'guest notice',
        now
    });
};

test('validateVerifiedLineIdentity rejects arbitrary or malformed identity claims', () => {
    assert.equal(validateVerifiedLineIdentity(null), null);
    assert.equal(validateVerifiedLineIdentity({ lineUserId: 'U1' }), null);
    assert.equal(validateVerifiedLineIdentity({ ...verifiedIdentity, provider: 'manual' }), null);
    assert.equal(validateVerifiedLineIdentity({ ...verifiedIdentity, verifiedAt: 'not-date' }), null);

    assert.deepEqual(validateVerifiedLineIdentity(verifiedIdentity), verifiedIdentity);
});

test('upsertProfile creates one public profile and preserves createdAt on re-sync', async () => {
    const store = createProfileStore();

    const first = await store.upsertProfile({ verifiedIdentity, profile });
    const firstProfile = requireProfile(first);

    assert.equal(first.status, 'bound');
    assert.equal(firstProfile.lineUserId, verifiedIdentity.lineUserId);
    assert.equal(firstProfile.displayName, profile.displayName);
    assert.equal(firstProfile.avatarUrl, profile.avatarUrl);
    assert.equal(firstProfile.createdAt, '2026-05-05T12:00:00.000Z');
    assert.deepEqual(firstProfile.counters, {
        gamesPlayed: 0,
        wins: 0,
        lastPlayedAt: null
    });

    const second = await store.upsertProfile({
        verifiedIdentity,
        profile: {
            displayName: '銀座玩家 Updated',
            avatarUrl: 'https://example.test/new-avatar.png'
        }
    });
    const secondProfile = requireProfile(second);

    assert.equal(secondProfile.createdAt, firstProfile.createdAt);
    assert.equal(secondProfile.displayName, '銀座玩家 Updated');
    assert.equal(secondProfile.updatedAt, '2026-05-05T12:00:00.000Z');
});

test('upsertProfile rejects untrusted or invalid identity payloads', async () => {
    const store = createProfileStore();

    const result = await store.upsertProfile({
        verifiedIdentity: {
            provider: 'line',
            lineUserId: '',
            verifiedAt: 'bad-date',
            source: ''
        },
        profile
    });

    assert.equal(result.status, 'unverified');
    assert.equal(result.profile, undefined);
    assert.equal(result.guestNotice, 'guest notice');
});

test('updateCountersForCompletedGame ignores missing profiles and caps wins by games played', async () => {
    const store = createProfileStore();

    assert.equal(await store.updateCountersForCompletedGame({ lineUserId: 'missing', won: true }), null);
    await store.upsertProfile({ verifiedIdentity, profile });

    const first = await store.updateCountersForCompletedGame({
        lineUserId: verifiedIdentity.lineUserId,
        won: true,
        completedAt: '2026-05-05T14:00:00.000Z'
    });
    assert.ok(first);
    assert.deepEqual(first.counters, {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-05-05T14:00:00.000Z'
    });

    const second = await store.updateCountersForCompletedGame({
        lineUserId: verifiedIdentity.lineUserId,
        won: true,
        completedAt: '2026-05-05T15:00:00.000Z'
    });
    assert.ok(second);
    assert.equal(second.counters.wins, 2);
    assert.equal(second.counters.gamesPlayed, 2);
});

test('buildPublicAccountProfile strips private account fields and repairs counters', () => {
    const publicProfile = buildPublicAccountProfile({
        lineUserId: 'U_PUBLIC',
        displayName: 'Public',
        avatarUrl: '',
        createdAt: '2026-05-05T12:00:00.000Z',
        updatedAt: '2026-05-05T12:00:00.000Z',
        counters: undefined,
        rawToken: 'private'
    } as unknown as Parameters<typeof buildPublicAccountProfile>[0]);

    assert.deepEqual(publicProfile, {
        lineUserId: 'U_PUBLIC',
        displayName: 'Public',
        createdAt: '2026-05-05T12:00:00.000Z',
        updatedAt: '2026-05-05T12:00:00.000Z',
        counters: {
            gamesPlayed: 0,
            wins: 0,
            lastPlayedAt: null
        }
    });
});
