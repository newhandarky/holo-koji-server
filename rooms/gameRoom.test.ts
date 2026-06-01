import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './gameRoom.js';
import {
    restoreRoomFromSnapshot,
    type RestorableRoomSnapshot
} from './roomRestore.js';
import { createDisconnectedSocket } from '../utils/roomSession.js';

test('GameRoom module constructs default room state without starting the server entrypoint', () => {
    const room = new GameRoom('room-default');

    assert.equal(room.roomId, 'room-default');
    assert.equal(room.maxPlayers, 2);
    assert.equal(room.hostId, null);
    assert.equal(room.gameState, null);
    assert.deepEqual(room.players, []);
    assert.equal(room.npcId, null);
});

test('GameRoom snapshot serializes seats without socket objects', () => {
    const room = new GameRoom('room-snapshot');
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];

    const snapshot = room.buildRoomSnapshot();
    const seats = snapshot.players as Array<Record<string, unknown>>;

    assert.equal(seats.length, 1);
    assert.deepEqual(seats[0], {
        playerId: 'host',
        name: 'Host',
        lineUserId: undefined,
        avatarUrl: undefined,
        accountProfile: undefined,
        sessionToken: 'host-token',
        isNpc: false
    });
    assert.equal('ws' in (seats[0] ?? {}), false);
});

test('GameRoom remains compatible with room snapshot restore', () => {
    const room = new GameRoom('room-restore');
    room.hostId = 'host';
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];
    assert.equal(room.regenerateBaseGeishas(), true);

    const result = restoreRoomFromSnapshot(
        room.buildRoomSnapshot() as RestorableRoomSnapshot,
        { createRoom: roomId => new GameRoom(roomId) }
    );

    assert.equal(result.errorMessage, null);
    assert.equal(result.room?.roomId, 'room-restore');
    assert.equal(result.room?.hostId, 'host');
    assert.equal(result.room?.players[0]?.playerId, 'host');
    assert.equal(result.room?.players[0]?.ws.readyState, 3);
    assert.equal(result.room?.baseGeishas?.length, 7);
});
