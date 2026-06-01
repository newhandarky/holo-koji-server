import test from 'node:test';
import assert from 'node:assert/strict';
import type { RoomSocketLike } from '../utils/roomSession.js';
import {
    buildRoomSnapshot,
    persistRoomSnapshot,
    type RoomSnapshot,
    type RoomSnapshotSource
} from './roomSnapshot.js';

const socket: RoomSocketLike = {
    readyState: 1,
    send: () => { }
};

const makeSource = (): RoomSnapshotSource => ({
    roomId: 'room-a',
    hostId: 'host',
    geishaSet: 'default',
    setupMode: 'custom',
    customSelection: { characterIds: ['character-1'] },
    npcId: 'npc',
    npcDifficulty: 'hard',
    createdAt: 123,
    matchCompletionCounter: 2,
    currentCompletionId: 'room-a:match-2:ended',
    players: [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: socket
    }],
    baseGeishas: null,
    gameState: null
});

test('buildRoomSnapshot serializes seats without runtime sockets', () => {
    const source = makeSource();
    const snapshot = buildRoomSnapshot(source);

    assert.deepEqual(snapshot.players, [{
        playerId: 'host',
        name: 'Host',
        lineUserId: undefined,
        avatarUrl: undefined,
        accountProfile: undefined,
        sessionToken: 'host-token',
        isNpc: false
    }]);
    assert.equal('ws' in (snapshot.players[0] ?? {}), false);
    assert.equal('roundResolveTimer' in snapshot, false);
    assert.equal('readyConfirmations' in snapshot, false);
    assert.equal('dealSequence' in snapshot, false);
});

test('buildRoomSnapshot keeps persisted room metadata without mutating input', () => {
    const source = makeSource();
    const snapshotBefore = structuredClone({
        ...source,
        players: source.players.map(({ ws: _ws, ...seat }) => seat)
    });

    const snapshot = buildRoomSnapshot(source);

    assert.equal(snapshot.npcId, 'npc');
    assert.equal(snapshot.npcDifficulty, 'hard');
    assert.equal(snapshot.setupMode, 'custom');
    assert.deepEqual(snapshot.customSelection, { characterIds: ['character-1'] });
    assert.equal(snapshot.currentCompletionId, 'room-a:match-2:ended');
    assert.deepEqual({
        ...source,
        players: source.players.map(({ ws: _ws, ...seat }) => seat)
    }, snapshotBefore);
});

test('persistRoomSnapshot skips saves while persistence is disabled', () => {
    let calls = 0;

    persistRoomSnapshot(makeSource(), {
        isPersistenceEnabled: () => false,
        saveSnapshot: async () => {
            calls += 1;
        }
    });

    assert.equal(calls, 0);
});

test('persistRoomSnapshot saves the typed room snapshot when persistence is enabled', () => {
    let savedRoomId: string | null = null;
    const savedSnapshots: RoomSnapshot[] = [];

    persistRoomSnapshot(makeSource(), {
        isPersistenceEnabled: () => true,
        saveSnapshot: async (roomId, snapshot) => {
            savedRoomId = roomId;
            savedSnapshots.push(snapshot);
        }
    });

    assert.equal(savedRoomId, 'room-a');
    assert.equal(savedSnapshots[0]?.players[0]?.sessionToken, 'host-token');
});
