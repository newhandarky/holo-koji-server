import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACHIEVEMENT_CATALOG,
    createAchievementStore
} from './achievementStore.js';

const durableStatus = {
    mode: 'durable',
    available: true,
    message: 'Account profiles are persistent.'
};

const temporaryStatus = {
    mode: 'temporary',
    available: true,
    message: 'Account profiles are temporary in this environment.'
};

const unavailableStatus = {
    mode: 'temporary',
    available: false,
    message: 'Account profiles are unavailable; durable persistence is not connected.'
};

const fixedClock = (() => {
    let minute = 0;
    return () => {
        const value = new Date(`2026-05-05T12:${String(minute).padStart(2, '0')}:00.000Z`);
        minute += 1;
        return value;
    };
})();

const createStore = (status = durableStatus) => createAchievementStore({
    now: fixedClock,
    getPersistenceStatus: () => status
});

const createPlayers = () => [
    {
        playerId: 'host',
        accountProfile: {
            lineUserId: 'U_HOST'
        }
    },
    {
        playerId: 'guest',
        accountProfile: {
            lineUserId: 'U_GUEST'
        }
    }
];

const record = (store, completionId, winner = 'host', players = createPlayers()) => store.recordMatchCompletion({
    completionId,
    completedAt: '2026-05-05T14:00:00.000Z',
    winner,
    players
});

const getItem = (summary, achievementId) => summary.items.find((item) => item.achievementId === achievementId);

test('starter catalog contains exactly the four foundation achievements', () => {
    assert.deepEqual(
        ACHIEVEMENT_CATALOG.map((item) => [item.achievementId, item.conditionType, item.target]),
        [
            ['first_completed_match', 'completed_games', 1],
            ['first_win', 'wins', 1],
            ['complete_3_matches', 'completed_games', 3],
            ['win_3_matches', 'wins', 3]
        ]
    );
});

test('first completed match and first win unlock from server-confirmed completion', async () => {
    const store = createStore();

    await record(store, 'room-1:end');
    const hostSummary = await store.getAchievementSummary('U_HOST');
    const guestSummary = await store.getAchievementSummary('U_GUEST');

    assert.equal(getItem(hostSummary, 'first_completed_match').state, 'unlocked');
    assert.equal(getItem(hostSummary, 'first_win').state, 'unlocked');
    assert.equal(getItem(hostSummary, 'complete_3_matches').currentValue, 1);
    assert.equal(getItem(hostSummary, 'win_3_matches').currentValue, 1);
    assert.equal(hostSummary.newUnlockCount, 2);

    assert.equal(getItem(guestSummary, 'first_completed_match').state, 'unlocked');
    assert.equal(getItem(guestSummary, 'first_win').state, 'locked');
    assert.equal(getItem(guestSummary, 'complete_3_matches').currentValue, 1);
    assert.equal(getItem(guestSummary, 'win_3_matches').currentValue, 0);
    assert.equal(guestSummary.newUnlockCount, 1);
});

test('complete three matches and win three matches unlock at target', async () => {
    const store = createStore();

    await record(store, 'room-1:end');
    await record(store, 'room-2:end');
    await record(store, 'room-3:end');
    const summary = await store.getAchievementSummary('U_HOST');

    assert.equal(getItem(summary, 'complete_3_matches').state, 'unlocked');
    assert.equal(getItem(summary, 'complete_3_matches').currentValue, 3);
    assert.equal(getItem(summary, 'win_3_matches').state, 'unlocked');
    assert.equal(getItem(summary, 'win_3_matches').currentValue, 3);
});

test('repeated completionId does not increment progress or replace first unlock time', async () => {
    const store = createStore();

    await record(store, 'room-1:end');
    const firstSummary = await store.getAchievementSummary('U_HOST');
    const firstUnlock = getItem(firstSummary, 'first_completed_match').unlockedAt;

    await record(store, 'room-1:end');
    const repeatedSummary = await store.getAchievementSummary('U_HOST');

    assert.equal(getItem(repeatedSummary, 'complete_3_matches').currentValue, 1);
    assert.equal(getItem(repeatedSummary, 'win_3_matches').currentValue, 1);
    assert.equal(getItem(repeatedSummary, 'first_completed_match').unlockedAt, firstUnlock);
    assert.equal(repeatedSummary.newUnlockCount, firstSummary.newUnlockCount);
});

test('pre-025 counters do not initialize progress or unlocks', async () => {
    const store = createStore();

    const summary = await store.getAchievementSummary('U_HOST', {
        counters: {
            gamesPlayed: 99,
            wins: 99,
            lastPlayedAt: '2026-05-05T10:00:00.000Z'
        }
    });

    assert.equal(getItem(summary, 'first_completed_match').state, 'locked');
    assert.equal(getItem(summary, 'complete_3_matches').currentValue, 0);
    assert.equal(getItem(summary, 'win_3_matches').currentValue, 0);
});

test('guest match completion creates no achievement progress or unlock records', async () => {
    const store = createStore();

    const result = await record(store, 'guest:end', 'guest', [
        { playerId: 'guest' },
        { playerId: 'npc', isNpc: true }
    ]);

    assert.deepEqual(result.updates, []);
    const summary = await store.getAchievementSummary(null);
    assert.equal(summary.status, 'guest');
    assert.equal(summary.items, undefined);
});

test('temporary persistence returns unavailable state and creates no session-only progress', async () => {
    const store = createStore(temporaryStatus);

    const result = await record(store, 'temporary:end');
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.updates, []);

    const summary = await store.getAchievementSummary('U_HOST');
    assert.equal(summary.status, 'unavailable');
    assert.equal(summary.items, undefined);
});

test('unavailable persistence returns unavailable state and creates no session-only progress', async () => {
    const store = createStore(unavailableStatus);

    const result = await record(store, 'unavailable:end');
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.updates, []);

    const summary = await store.getAchievementSummary('U_HOST');
    assert.equal(summary.status, 'unavailable');
    assert.equal(summary.items, undefined);
});

test('client-supplied achievement claims and lineUserId fields are ignored', async () => {
    const store = createStore();

    await record(store, 'spoof:end', 'host', [
        {
            playerId: 'host',
            lineUserId: 'SPOOFED',
            achievementId: 'win_3_matches',
            currentValue: 99,
            unlockedAt: '2026-01-01T00:00:00.000Z',
            accountProfile: {
                lineUserId: 'U_HOST'
            }
        }
    ]);

    assert.equal(await store.getAchievementSummary('SPOOFED').then((summary) => getItem(summary, 'first_completed_match').state), 'locked');
    const hostSummary = await store.getAchievementSummary('U_HOST');
    assert.equal(getItem(hostSummary, 'win_3_matches').currentValue, 1);
});

test('available summary includes all four starter achievements', async () => {
    const store = createStore();

    await record(store, 'summary:end');
    const summary = await store.getAchievementSummary('U_HOST');

    assert.equal(summary.status, 'available');
    assert.equal(summary.items.length, 4);
    assert.equal(summary.persistenceStatus.mode, 'durable');
    assert.ok(summary.generatedAt);
});

test('acknowledgeNewUnlocks clears unseen marker and returns refreshed summary', async () => {
    const store = createStore();

    await record(store, 'ack:end');
    const before = await store.getAchievementSummary('U_HOST');
    assert.equal(before.newUnlockCount, 2);

    const after = await store.acknowledgeNewUnlocks('U_HOST', ['first_completed_match']);
    assert.equal(after.status, 'available');
    assert.equal(after.items.length, 4);
    assert.equal(getItem(after, 'first_completed_match').isNew, false);
    assert.equal(getItem(after, 'first_win').isNew, true);
    assert.equal(after.newUnlockCount, 1);

    const repeated = await store.acknowledgeNewUnlocks('U_HOST', ['first_completed_match']);
    assert.equal(repeated.newUnlockCount, 1);
});

test('acknowledgeNewUnlocks reports unavailable when durable storage fails during acknowledgement', async () => {
    const records = new Map();
    const redisClient = {
        isOpen: true,
        fail: false,
        async get(key) {
            if (this.fail) {
                throw new Error('redis unavailable');
            }
            return records.get(key) ?? null;
        },
        async set(key, value) {
            if (this.fail) {
                throw new Error('redis unavailable');
            }
            records.set(key, value);
        }
    };
    const store = createAchievementStore({
        now: fixedClock,
        redisClient,
        getPersistenceStatus: () => durableStatus
    });

    await record(store, 'ack-fail:end');
    redisClient.fail = true;

    const result = await store.acknowledgeNewUnlocks('U_HOST', ['first_completed_match']);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.items, undefined);
});
