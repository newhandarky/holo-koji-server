import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';
import {
    addRoomPlayer,
    buildPlayerMetaMap,
    detachRoomPlayer,
    removeRoomPlayer
} from './roomMembership.js';

const makeSocket = (readyState = 1): RoomSocketLike => ({
    readyState,
    send: () => { }
});

const makeSeat = (playerId = 'host'): RoomSeat => ({
    playerId,
    name: playerId,
    sessionToken: `${playerId}-token`,
    ws: makeSocket()
});

test('addRoomPlayer rejects empty ids and full rooms without mutating input', () => {
    const seats = [makeSeat('host')];
    const snapshot = [...seats];

    assert.equal(addRoomPlayer(seats, 2, '', makeSocket()).result, 'invalid');
    assert.equal(addRoomPlayer(seats, 1, 'guest', makeSocket()).result, 'full');
    assert.deepEqual(seats, snapshot);
});

test('addRoomPlayer uses injected session tokens for new seats', () => {
    const ws = makeSocket();
    const result = addRoomPlayer([], 2, 'host', ws, {
        displayName: ' Host '
    }, () => 'fixed-token');

    assert.equal(result.result, 'added');
    assert.deepEqual(result.seats, [{
        playerId: 'host',
        ws,
        sessionToken: 'fixed-token',
        name: 'Host',
        lineUserId: undefined,
        avatarUrl: undefined,
        accountProfile: undefined
    }]);
});

test('addRoomPlayer rejects reconnect without matching session token', () => {
    const seats = [makeSeat()];
    const snapshot = [...seats];
    const result = addRoomPlayer(seats, 2, 'host', makeSocket());

    assert.equal(result.result, 'session-mismatch');
    assert.deepEqual(seats, snapshot);
});

test('addRoomPlayer reconnects matching sessions with a new socket and preserved token', () => {
    const seats = [makeSeat()];
    const previousSocket = seats[0]?.ws;
    const nextSocket = makeSocket();
    const result = addRoomPlayer(seats, 2, 'host', nextSocket, {
        roomSessionToken: 'host-token',
        displayName: 'Restored Host'
    });

    assert.equal(result.result, 'existing');
    assert.equal(result.seats[0]?.ws, nextSocket);
    assert.notEqual(result.seats[0]?.ws, previousSocket);
    assert.equal(result.seats[0]?.sessionToken, 'host-token');
    assert.equal(result.seats[0]?.name, 'Restored Host');
    assert.notEqual(result.seats[0], seats[0]);
});

test('addRoomPlayer rejects tokenless and npc seat reconnect attempts', () => {
    const tokenlessSeat = { ...makeSeat(), sessionToken: undefined };
    const npcSeat = { ...makeSeat('npc'), isNpc: true };

    assert.equal(addRoomPlayer([tokenlessSeat], 2, 'host', makeSocket()).result, 'session-mismatch');
    assert.equal(addRoomPlayer([npcSeat], 2, 'npc', makeSocket(), {
        roomSessionToken: 'npc-token'
    }).result, 'session-mismatch');
});

test('detachRoomPlayer ignores stale sockets and replaces current sockets immutably', () => {
    const currentSocket = makeSocket();
    const staleSocket = makeSocket();
    const seats = [{ ...makeSeat(), ws: currentSocket }];

    assert.equal(detachRoomPlayer(seats, 'host', staleSocket).detached, false);
    const result = detachRoomPlayer(seats, 'host', currentSocket);
    assert.equal(result.detached, true);
    assert.equal(result.seats[0]?.ws.readyState, 3);
    assert.equal(seats[0]?.ws, currentSocket);
});

test('removeRoomPlayer ignores stale sockets and buildPlayerMetaMap preserves seat input', () => {
    const seats = [
        { ...makeSeat('host'), lineUserId: 'line-host', avatarUrl: 'https://example.test/host.png' },
        makeSeat('guest')
    ];
    const snapshot = [...seats];

    assert.deepEqual(buildPlayerMetaMap(seats), {
        host: {
            name: 'host',
            lineUserId: 'line-host',
            avatarUrl: 'https://example.test/host.png'
        },
        guest: {
            name: 'guest',
            lineUserId: undefined,
            avatarUrl: undefined
        }
    });
    assert.deepEqual(removeRoomPlayer(seats, 'guest', makeSocket()), seats);
    assert.deepEqual(removeRoomPlayer(seats, 'guest'), [seats[0]]);
    assert.deepEqual(seats, snapshot);
});
