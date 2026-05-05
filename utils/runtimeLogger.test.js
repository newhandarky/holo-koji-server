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
