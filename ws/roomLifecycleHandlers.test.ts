import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { GameRoom } from '../rooms/gameRoom.js';
import type {
    RoomScheduler,
    TimerHandle
} from '../rooms/roomScheduler.js';
import { createDisconnectedSocket } from '../utils/roomSession.js';
import { createConnectionContext } from './connectionContext.js';
import {
    handleCreateRoom,
    handleJoinRoom,
    handleLeaveRoom
} from './roomLifecycleHandlers.js';

type CapturedMessage = {
    type: string;
    payload?: Record<string, unknown>;
};

const makeSocket = (): { ws: WebSocket; messages: CapturedMessage[] } => {
    const messages: CapturedMessage[] = [];
    return {
        ws: {
            readyState: 1,
            send: (payload: string) => {
                messages.push(JSON.parse(payload) as CapturedMessage);
            }
        } as unknown as WebSocket,
        messages
    };
};

const makeScheduler = (): {
    scheduler: RoomScheduler;
    scheduled: Array<{ callback: () => void; delayMs: number }>;
} => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    return {
        scheduler: {
            setTimeout: (callback, delayMs) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: () => {}
        },
        scheduled
    };
};

const makeDeps = (scheduler?: RoomScheduler) => {
    const deleted: string[] = [];
    return {
        rooms: new Map<string, GameRoom>(),
        createRoom: (roomId: string) => new GameRoom(roomId),
        loadRoomSnapshot: async <TSnapshot,>(_roomId: string): Promise<TSnapshot | null> => null,
        deleteRoomSnapshot: async (roomId: string): Promise<void> => {
            deleted.push(roomId);
        },
        ...(scheduler ? { scheduler } : {}),
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

test('handleCreateRoom preserves missing player validation and returns session token on success', async () => {
    const invalid = makeSocket();
    const valid = makeSocket();
    const deps = makeDeps();

    await handleCreateRoom(invalid.ws, {}, createConnectionContext('test'), deps);
    await handleCreateRoom(valid.ws, { playerId: 'host' }, createConnectionContext('test'), deps);

    assert.deepEqual(invalid.messages[0], {
        type: 'ERROR',
        payload: { message: '缺少 playerId' }
    });
    assert.equal(valid.messages[0]?.type, 'ROOM_CREATED');
    assert.equal(typeof valid.messages[0]?.payload?.roomId, 'string');
    assert.equal(typeof valid.messages[0]?.payload?.roomSessionToken, 'string');
});

test('handleCreateRoom rejects invalid custom setup and schedules npc rooms after 800ms', async () => {
    const invalid = makeSocket();
    const npc = makeSocket();
    const { scheduler, scheduled } = makeScheduler();
    const deps = makeDeps(scheduler);

    await handleCreateRoom(invalid.ws, {
        playerId: 'host',
        setupMode: 'custom',
        customSelection: { characterIds: [] }
    }, createConnectionContext('test'), deps);
    await handleCreateRoom(npc.ws, {
        playerId: 'host',
        mode: 'npc',
        aiDifficulty: 'hard'
    }, createConnectionContext('test'), deps);

    assert.equal(invalid.messages[0]?.type, 'ERROR');
    assert.equal(scheduled[0]?.delayMs, 800);
});

test('handleJoinRoom preserves missing room, active game and session mismatch errors', async () => {
    const missing = makeSocket();
    const active = makeSocket();
    const mismatch = makeSocket();
    const deps = makeDeps();
    const activeRoom = prepareWaitingRoom('ACTIVE');
    activeRoom.gameState = { phase: 'playing' } as NonNullable<typeof activeRoom.gameState>;
    deps.rooms.set('ACTIVE', activeRoom);
    const existingRoom = prepareWaitingRoom('EXISTING');
    deps.rooms.set('EXISTING', existingRoom);

    await handleJoinRoom(missing.ws, { roomId: 'MISSING', playerId: 'guest' }, createConnectionContext('test'), deps);
    await handleJoinRoom(active.ws, { roomId: 'ACTIVE', playerId: 'guest' }, createConnectionContext('test'), deps);
    await handleJoinRoom(mismatch.ws, { roomId: 'EXISTING', playerId: 'host' }, createConnectionContext('test'), deps);

    assert.equal(missing.messages[0]?.payload?.code, 'ROOM_NOT_FOUND');
    assert.equal(active.messages[0]?.payload?.code, 'ROOM_ALREADY_STARTED');
    assert.equal(mismatch.messages[0]?.payload?.code, 'PLAYER_ID_TAKEN');
});

test('handleJoinRoom reconnects matching sessions with viewer-safe state', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('RECONNECT');
    room.gameState = { phase: 'playing' } as NonNullable<typeof room.gameState>;
    room.buildClientGameState = () => ({ phase: 'playing', marker: 'viewer-safe' } as unknown as NonNullable<typeof room.gameState>);
    deps.rooms.set('RECONNECT', room);

    await handleJoinRoom(socket.ws, {
        roomId: 'RECONNECT',
        playerId: 'host',
        roomSessionToken: 'host-token'
    }, createConnectionContext('test'), deps);

    assert.deepEqual(socket.messages[0], {
        type: 'GAME_STATE_UPDATED',
        payload: { phase: 'playing', marker: 'viewer-safe' }
    });
});

test('handleJoinRoom rejects npc seat takeover attempts', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('NPC-TAKEOVER');
    const npcId = room.addNpcPlayer('easy');
    room.gameState = { phase: 'playing' } as NonNullable<typeof room.gameState>;
    deps.rooms.set('NPC-TAKEOVER', room);

    await handleJoinRoom(socket.ws, {
        roomId: 'NPC-TAKEOVER',
        playerId: npcId
    }, createConnectionContext('test'), deps);

    assert.equal(socket.messages[0]?.payload?.code, 'PLAYER_ID_TAKEN');
});

test('handleJoinRoom schedules full waiting rooms after 1000ms', async () => {
    const socket = makeSocket();
    const { scheduler, scheduled } = makeScheduler();
    const deps = makeDeps(scheduler);
    deps.rooms.set('WAITING', prepareWaitingRoom('WAITING'));

    await handleJoinRoom(socket.ws, { roomId: 'WAITING', playerId: 'guest' }, createConnectionContext('test'), deps);

    assert.equal(socket.messages[0]?.type, 'PLAYER_JOINED');
    assert.equal(scheduled[0]?.delayMs, 1000);
});

test('handleLeaveRoom removes waiting seats and deletes empty rooms', () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('LEAVE');
    room.players[0]!.ws = socket.ws;
    const broadcasts: Array<{ type: string; payload?: unknown }> = [];
    room.broadcast = message => {
        broadcasts.push(message);
    };
    deps.rooms.set('LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'LEAVE';
    context.currentPlayerId = 'host';

    handleLeaveRoom(socket.ws, context, deps);

    assert.equal(deps.rooms.has('LEAVE'), false);
    assert.deepEqual(deps.deleted, ['LEAVE']);
    assert.deepEqual(broadcasts[0], {
        type: 'PLAYER_LEFT',
        payload: { playerId: 'host' }
    });
    assert.equal(context.currentRoomId, null);
});

test('handleLeaveRoom deletes waiting rooms that retain only an npc seat', () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('NPC-LEAVE');
    room.players[0]!.ws = socket.ws;
    room.addNpcPlayer('easy');
    deps.rooms.set('NPC-LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'NPC-LEAVE';
    context.currentPlayerId = 'host';

    handleLeaveRoom(socket.ws, context, deps);

    assert.equal(deps.rooms.has('NPC-LEAVE'), false);
    assert.deepEqual(deps.deleted, ['NPC-LEAVE']);
});

test('handleLeaveRoom detaches active players without deleting seats', () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('ACTIVE-LEAVE');
    room.players[0]!.ws = socket.ws;
    room.gameState = { phase: 'playing' } as NonNullable<typeof room.gameState>;
    deps.rooms.set('ACTIVE-LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'ACTIVE-LEAVE';
    context.currentPlayerId = 'host';

    handleLeaveRoom(socket.ws, context, deps);

    assert.equal(deps.rooms.has('ACTIVE-LEAVE'), true);
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0]?.ws.readyState, 3);
});

test('handleLeaveRoom ignores stale waiting-room sockets after reconnect', () => {
    const staleSocket = makeSocket();
    const currentSocket = makeSocket();
    const deps = makeDeps();
    const room = prepareWaitingRoom('STALE-LEAVE');
    room.players[0]!.ws = staleSocket.ws;
    assert.equal(room.addPlayer('host', currentSocket.ws, { roomSessionToken: 'host-token' }), 'existing');
    deps.rooms.set('STALE-LEAVE', room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'STALE-LEAVE';
    context.currentPlayerId = 'host';

    handleLeaveRoom(staleSocket.ws, context, deps);

    assert.equal(deps.rooms.has('STALE-LEAVE'), true);
    assert.equal(room.players[0]?.ws, currentSocket.ws);
    assert.deepEqual(deps.deleted, []);
});

test('handleCreateRoom rejects repeated room attachment on the same socket', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const context = createConnectionContext('test');

    await handleCreateRoom(socket.ws, { playerId: 'host' }, context, deps);
    await handleCreateRoom(socket.ws, { playerId: 'host' }, context, deps);

    assert.equal(deps.rooms.size, 1);
    assert.equal(socket.messages.at(-1)?.payload?.code, 'ALREADY_IN_ROOM');
});
