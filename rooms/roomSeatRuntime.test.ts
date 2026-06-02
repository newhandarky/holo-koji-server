import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';
import {
    addRoomSeat,
    detachRoomSeatConnection,
    getRoomPlayerMetaMap,
    isRoomFull,
    removeRoomSeat
} from './roomSeatRuntime.js';

const makeSocket = (readyState = 1): RoomSocketLike => ({
    readyState,
    send: () => { }
});

const makeSeat = (playerId: string, ws: RoomSocketLike = makeSocket()): RoomSeat => ({
    playerId,
    name: playerId,
    sessionToken: `${playerId}-token`,
    ws
});

const makeRoom = (players: RoomSeat[] = []) => {
    let persisted = 0;
    return {
        roomId: 'seat-runtime',
        players,
        maxPlayers: 2,
        gameState: { phase: 'playing' as const },
        persistRoomSnapshot: () => {
            persisted += 1;
        },
        get persisted() {
            return persisted;
        }
    };
};

test('addRoomSeat adds human players and persists snapshots', () => {
    const ws = makeSocket();
    const room = makeRoom();

    const result = addRoomSeat(room, 'host', ws, { displayName: 'Host' });

    assert.equal(result, 'added');
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0]?.playerId, 'host');
    assert.equal(room.players[0]?.name, 'Host');
    assert.equal(room.players[0]?.ws, ws);
    assert.equal(room.persisted, 1);
});

test('addRoomSeat reconnects matching sessions without changing the token', () => {
    const previousSocket = makeSocket();
    const nextSocket = makeSocket();
    const room = makeRoom([makeSeat('host', previousSocket)]);

    const result = addRoomSeat(room, 'host', nextSocket, {
        roomSessionToken: 'host-token',
        displayName: 'Restored Host'
    });

    assert.equal(result, 'existing');
    assert.equal(room.players[0]?.ws, nextSocket);
    assert.equal(room.players[0]?.sessionToken, 'host-token');
    assert.equal(room.players[0]?.name, 'Restored Host');
    assert.equal(room.persisted, 1);
});

test('addRoomSeat rejects session mismatches without mutation or persistence', () => {
    const seat = makeSeat('host');
    const room = makeRoom([seat]);

    const result = addRoomSeat(room, 'host', makeSocket(), {
        roomSessionToken: 'wrong-token'
    });

    assert.equal(result, 'session-mismatch');
    assert.deepEqual(room.players, [seat]);
    assert.equal(room.persisted, 0);
});

test('removeRoomSeat ignores stale sockets and persists real removals', () => {
    const currentSocket = makeSocket();
    const staleSocket = makeSocket();
    const room = makeRoom([makeSeat('host', currentSocket), makeSeat('guest')]);

    assert.equal(removeRoomSeat(room, 'host', staleSocket), false);
    assert.equal(room.players.length, 2);
    assert.equal(room.persisted, 0);

    assert.equal(removeRoomSeat(room, 'host', currentSocket), true);
    assert.deepEqual(room.players.map(player => player.playerId), ['guest']);
    assert.equal(room.persisted, 1);
});

test('detachRoomSeatConnection replaces current sockets and ignores stale sockets', () => {
    const currentSocket = makeSocket();
    const staleSocket = makeSocket();
    const room = makeRoom([makeSeat('host', currentSocket)]);

    assert.equal(detachRoomSeatConnection(room, 'host', staleSocket), false);
    assert.equal(room.players[0]?.ws, currentSocket);
    assert.equal(room.persisted, 0);

    assert.equal(detachRoomSeatConnection(room, 'host', currentSocket), true);
    assert.equal(room.players[0]?.ws.readyState, 3);
    assert.notEqual(room.players[0]?.ws, currentSocket);
    assert.equal(room.persisted, 1);
});

test('seat runtime exposes full state and player metadata without mutation', () => {
    const room = makeRoom([
        { ...makeSeat('host'), lineUserId: 'line-host' },
        makeSeat('guest')
    ]);

    assert.equal(isRoomFull(room), true);
    assert.deepEqual(getRoomPlayerMetaMap(room), {
        host: {
            name: 'host',
            lineUserId: 'line-host',
            avatarUrl: undefined
        },
        guest: {
            name: 'guest',
            lineUserId: undefined,
            avatarUrl: undefined
        }
    });
    assert.equal(room.persisted, 0);
});
