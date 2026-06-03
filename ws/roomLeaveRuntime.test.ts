import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { GameRoom } from '../rooms/gameRoom.js';
import { createDisconnectedSocket } from '../utils/roomSession.js';
import { createConnectionContext } from './connectionContext.js';
import { leaveRoomFromLifecycleContext } from './roomLeaveRuntime.js';

const makeSocket = (): WebSocket => ({
    readyState: 1,
    send: () => {}
} as unknown as WebSocket);

const makeDeps = () => {
    const deleted: string[] = [];
    return {
        rooms: new Map<string, GameRoom>(),
        createRoom: (roomId: string) => new GameRoom(roomId),
        loadRoomSnapshot: async <TSnapshot,>(): Promise<TSnapshot | null> => null,
        deleteRoomSnapshot: async (roomId: string): Promise<void> => {
            deleted.push(roomId);
        },
        deleted
    };
};

const prepareWaitingRoom = (roomId = 'ROOM01'): GameRoom => {
    const room = new GameRoom(roomId);
    room.hostId = 'host';
    room.players = [{
        playerId: 'host',
        ws: createDisconnectedSocket(),
        sessionToken: 'host-token'
    }];
    assert.equal(room.regenerateBaseGeishas(), true);
    return room;
};

test('leaveRoomFromLifecycleContext removes waiting seats and deletes empty rooms', () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('LEAVE');
    room.players[0]!.ws = socket;
    const broadcasts: Array<{ type: string; payload?: unknown }> = [];
    room.broadcast = message => {
        broadcasts.push(message);
    };
    deps.rooms.set('LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'LEAVE';
    context.currentPlayerId = 'host';

    leaveRoomFromLifecycleContext(socket, context, deps);

    assert.equal(deps.rooms.has('LEAVE'), false);
    assert.deepEqual(deps.deleted, ['LEAVE']);
    assert.deepEqual(broadcasts[0], {
        type: 'PLAYER_LEFT',
        payload: { playerId: 'host' }
    });
    assert.equal(context.currentRoomId, null);
    assert.equal(context.currentPlayerId, null);
});

test('leaveRoomFromLifecycleContext deletes waiting rooms left with only npc seats', () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('NPC-LEAVE');
    room.players[0]!.ws = socket;
    room.addNpcPlayer('easy');
    deps.rooms.set('NPC-LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'NPC-LEAVE';
    context.currentPlayerId = 'host';

    leaveRoomFromLifecycleContext(socket, context, deps);

    assert.equal(deps.rooms.has('NPC-LEAVE'), false);
    assert.deepEqual(deps.deleted, ['NPC-LEAVE']);
});

test('leaveRoomFromLifecycleContext detaches active players and ignores stale waiting sockets', () => {
    const activeSocket = makeSocket();
    const staleSocket = makeSocket();
    const currentSocket = makeSocket();
    const deps = makeDeps();
    const activeRoom = prepareWaitingRoom('ACTIVE');
    activeRoom.players[0]!.ws = activeSocket;
    activeRoom.gameState = { phase: 'playing' } as NonNullable<typeof activeRoom.gameState>;
    deps.rooms.set('ACTIVE', activeRoom);
    const staleRoom = prepareWaitingRoom('STALE');
    staleRoom.players[0]!.ws = staleSocket;
    assert.equal(staleRoom.addPlayer('host', currentSocket, { roomSessionToken: 'host-token' }), 'existing');
    deps.rooms.set('STALE', staleRoom);

    const activeContext = createConnectionContext('test');
    activeContext.currentRoomId = 'ACTIVE';
    activeContext.currentPlayerId = 'host';
    leaveRoomFromLifecycleContext(activeSocket, activeContext, deps);

    const staleContext = createConnectionContext('test');
    staleContext.currentRoomId = 'STALE';
    staleContext.currentPlayerId = 'host';
    leaveRoomFromLifecycleContext(staleSocket, staleContext, deps);

    assert.equal(deps.rooms.has('ACTIVE'), true);
    assert.equal(activeRoom.players[0]?.ws.readyState, 3);
    assert.equal(deps.rooms.has('STALE'), true);
    assert.equal(staleRoom.players[0]?.ws, currentSocket);
});
