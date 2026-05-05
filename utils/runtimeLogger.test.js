import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGameState, summarizeWebSocketMessage } from './runtimeLogger.js';

test('summarizeWebSocketMessage keeps only event-level context', () => {
    const summary = summarizeWebSocketMessage({
        type: 'GAME_ACTION',
        payload: {
            roomId: 'ROOM01',
            playerId: 'p1',
            action: {
                type: 'INITIATE_COMPETITION',
                payload: {
                    groups: [['c1', 'c2'], ['c3', 'c4']]
                }
            },
            pendingInteraction: {
                offeredCards: [{ id: 'hidden-card' }]
            }
        }
    });

    assert.deepEqual(summary, {
        type: 'GAME_ACTION',
        roomId: 'ROOM01',
        playerId: 'p1',
        actionType: 'INITIATE_COMPETITION',
        hasPayload: true
    });
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'groups'), false);
});

test('summarizeWebSocketMessage includes setup mode without selected IDs', () => {
    const summary = summarizeWebSocketMessage({
        type: 'CREATE_ROOM',
        payload: {
            roomId: 'ROOM01',
            playerId: 'p1',
            mode: 'online',
            geishaSet: 'hololive',
            setupMode: 'custom',
            customSelection: {
                characterIds: ['hidden-for-log-safety']
            }
        }
    });

    assert.deepEqual(summary, {
        type: 'CREATE_ROOM',
        roomId: 'ROOM01',
        playerId: 'p1',
        mode: 'online',
        geishaSet: 'hololive',
        setupMode: 'custom',
        hasPayload: true
    });
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'customSelection'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'characterIds'), false);
});

test('summarizeGameState emits redacted server state summary only', () => {
    const summary = summarizeGameState({
        gameId: 'ROOM01',
        geishaSet: 'collaboration',
        phase: 'playing',
        round: 2,
        players: [
            { id: 'p1', hand: [{ id: 'c1' }] },
            { id: 'p2', hand: [{ id: 'c2' }] }
        ],
        pendingInteraction: {
            type: 'GIFT_SELECTION',
            offeredCards: [{ id: 'hidden-card' }]
        }
    });

    assert.deepEqual(summary, {
        gameId: 'ROOM01',
        geishaSet: 'collaboration',
        phase: 'playing',
        round: 2,
        playerCount: 2,
        hasPendingInteraction: true
    });
});

test('summarizeWebSocketMessage reports account status without LINE profile details', () => {
    const summary = summarizeWebSocketMessage({
        type: 'ACCOUNT_SYNC_RESULT',
        payload: {
            status: 'bound',
            profile: {
                lineUserId: 'U1234567890',
                displayName: '銀座玩家',
                avatarUrl: 'https://example.test/avatar.png'
            },
            verifiedIdentity: {
                lineUserId: 'U1234567890'
            },
            token: 'secret',
            rawProfile: {
                userId: 'U1234567890'
            },
            persistenceStatus: {
                mode: 'durable',
                message: 'Account profiles are persistent.'
            }
        }
    });

    assert.deepEqual(summary, {
        type: 'ACCOUNT_SYNC_RESULT',
        accountStatus: 'bound',
        accountPersistenceMode: 'durable',
        hasPayload: true
    });
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'lineUserId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'displayName'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'token'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'rawProfile'), false);
});

test('summarizeWebSocketMessage reports achievement status without progress or account details', () => {
    const summary = summarizeWebSocketMessage({
        type: 'ACHIEVEMENT_STATUS_RESULT',
        payload: {
            status: 'available',
            newUnlockCount: 2,
            items: [
                {
                    achievementId: 'first_completed_match',
                    title: '初次花見',
                    currentValue: 1,
                    target: 1,
                    unlockedAt: '2026-05-05T12:00:00.000Z'
                }
            ],
            profile: {
                lineUserId: 'U1234567890'
            },
            hiddenCards: [{ id: 'hidden-card' }],
            token: 'secret',
            persistenceStatus: {
                mode: 'durable',
                message: 'Account profiles are persistent.'
            }
        }
    });

    assert.deepEqual(summary, {
        type: 'ACHIEVEMENT_STATUS_RESULT',
        accountPersistenceMode: 'durable',
        achievementStatus: 'available',
        achievementNewUnlockCount: 2,
        hasPayload: true
    });
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'items'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'lineUserId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'hiddenCards'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(summary, 'token'), false);
});

test('summarizeGameState reports account persistence only', () => {
    const summary = summarizeGameState({
        gameId: 'ROOM01',
        phase: 'waiting',
        players: [],
        accountPersistenceStatus: {
            mode: 'temporary',
            message: 'Account profiles are temporary in this environment.',
            redisUrl: 'redis://secret'
        }
    });

    assert.deepEqual(summary, {
        gameId: 'ROOM01',
        phase: 'waiting',
        playerCount: 0,
        accountPersistenceMode: 'temporary',
        hasPendingInteraction: false
    });
});

test('backend diagnostics remain opt-in', async () => {
    const originalFlag = process.env.GAME_DIAGNOSTICS;
    const originalDebug = console.debug;
    const calls = [];
    console.debug = (...args) => calls.push(args);

    try {
        process.env.GAME_DIAGNOSTICS = 'false';
        const quietModule = await import(`./runtimeLogger.js?quiet=${Date.now()}`);
        quietModule.backendLogger.diagnostic('quiet', { roomId: 'ROOM01' });
        assert.equal(calls.length, 0);

        process.env.GAME_DIAGNOSTICS = 'true';
        const enabledModule = await import(`./runtimeLogger.js?enabled=${Date.now()}`);
        enabledModule.backendLogger.diagnostic('enabled', { roomId: 'ROOM01' });
        assert.deepEqual(calls.at(-1), ['enabled', { roomId: 'ROOM01' }]);
    } finally {
        if (originalFlag === undefined) {
            delete process.env.GAME_DIAGNOSTICS;
        } else {
            process.env.GAME_DIAGNOSTICS = originalFlag;
        }
        console.debug = originalDebug;
    }
});
