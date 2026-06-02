import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createJsonPersistenceAdapter,
    type KeyValueClient
} from './persistenceAdapter.js';

const createAdapter = (overrides: Partial<Parameters<typeof createJsonPersistenceAdapter>[0]> = {}) => createJsonPersistenceAdapter({
    redisUrl: '',
    redisClient: null,
    logLabel: 'Test',
    durableMessage: 'persistent',
    temporaryMessage: 'temporary',
    unavailableMessage: 'unavailable',
    ...overrides
});

test('memory fallback stores and reads JSON when redisUrl is empty', async () => {
    const adapter = createAdapter();

    await adapter.setJson('profile:U1', { lineUserId: 'U1', gamesPlayed: 1 });
    const stored = await adapter.getJson<{ lineUserId: string; gamesPlayed: number }>('profile:U1');

    assert.deepEqual(stored, { lineUserId: 'U1', gamesPlayed: 1 });
    assert.deepEqual(adapter.getPersistenceStatus(), {
        mode: 'temporary',
        available: true,
        message: 'temporary'
    });
});

test('open redis client reports durable persistence and uses JSON get/set', async () => {
    const records = new Map<string, string>();
    const client: KeyValueClient = {
        isOpen: true,
        get: async (key) => records.get(key) ?? null,
        set: async (key, value) => {
            records.set(key, value);
        }
    };
    const adapter = createAdapter({ redisClient: client });

    await adapter.setJson('account:U1', { displayName: '銀座玩家' });
    const stored = await adapter.getJson<{ displayName: string }>('account:U1');

    assert.deepEqual(stored, { displayName: '銀座玩家' });
    assert.deepEqual(adapter.getPersistenceStatus(), {
        mode: 'durable',
        available: true,
        message: 'persistent'
    });
});

test('closed redis client connects lazily before reporting durable persistence', async () => {
    let connectCount = 0;
    const client: KeyValueClient = {
        isOpen: false,
        connect: async () => {
            connectCount += 1;
            client.isOpen = true;
        },
        get: async () => null,
        set: async () => undefined
    };
    const adapter = createAdapter({ redisClient: client });

    const status = await adapter.checkConnection();

    assert.equal(connectCount, 1);
    assert.deepEqual(status, {
        mode: 'durable',
        available: true,
        message: 'persistent'
    });
});

test('connection failure records unavailable status without exposing redisUrl', async () => {
    const client: KeyValueClient = {
        isOpen: false,
        connect: async () => {
            throw new Error('redis://secret-host:6379 failed');
        },
        get: async () => null,
        set: async () => undefined
    };
    const adapter = createAdapter({
        redisUrl: 'redis://secret-host:6379',
        redisClient: client
    });

    const status = await adapter.checkConnection();

    assert.deepEqual(status, {
        mode: 'temporary',
        available: false,
        message: 'unavailable'
    });
    assert.equal(status.message.includes('redis://secret-host:6379'), false);
});

test('storage failure after get switches status to unavailable', async () => {
    const client: KeyValueClient = {
        isOpen: true,
        get: async () => {
            throw new Error('read failed');
        },
        set: async () => undefined
    };
    const adapter = createAdapter({ redisClient: client });

    await assert.rejects(() => adapter.getJson('broken'));
    assert.deepEqual(adapter.getPersistenceStatus(), {
        mode: 'temporary',
        available: false,
        message: 'unavailable'
    });
});
