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
    parseCreateRoomPayload,
    parseJoinRoomPayload
} from './roomLifecyclePayloads.js';
import {
    createRoomFromLifecyclePayload,
    joinRoomFromLifecyclePayload
} from './roomCreateJoinRuntime.js';

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

const mustParseCreate = (payload: unknown) => {
    const result = parseCreateRoomPayload(payload);
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error('create payload should parse');
    }
    return result.value;
};

const mustParseJoin = (payload: unknown) => {
    const result = parseJoinRoomPayload(payload);
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error('join payload should parse');
    }
    return result.value;
};

test('createRoomFromLifecyclePayload creates waiting state and schedules npc rooms after 800ms', async () => {
    const socket = makeSocket();
    const { scheduler, scheduled } = makeScheduler();
    const deps = makeDeps(scheduler);
    const context = createConnectionContext('test');

    await createRoomFromLifecyclePayload(socket.ws, context, deps, mustParseCreate({
        playerId: 'host',
        mode: 'npc',
        aiDifficulty: 'hard'
    }));

    assert.equal(socket.messages[0]?.type, 'ROOM_CREATED');
    assert.equal(deps.rooms.size, 1);
    assert.equal(context.currentRoomId, socket.messages[0]?.payload?.roomId);
    assert.equal(context.currentPlayerId, 'host');
    assert.equal(scheduled[0]?.delayMs, 800);
    const room = deps.rooms.get(String(context.currentRoomId));
    assert.equal(room?.gameState?.phase, 'waiting');
    assert.equal(room?.players.length, 2);
});

test('createRoomFromLifecyclePayload rolls back invalid custom setup', async () => {
    const socket = makeSocket();
    const deps = makeDeps();
    const context = createConnectionContext('test');

    await createRoomFromLifecyclePayload(socket.ws, context, deps, mustParseCreate({
        playerId: 'host',
        setupMode: 'custom',
        customSelection: { characterIds: [] }
    }));

    assert.equal(deps.rooms.size, 0);
    assert.equal(context.currentRoomId, null);
    assert.equal(context.currentPlayerId, null);
    assert.equal(socket.messages[0]?.type, 'ERROR');
});

test('joinRoomFromLifecyclePayload updates waiting state and schedules full rooms after 1000ms', async () => {
    const socket = makeSocket();
    const { scheduler, scheduled } = makeScheduler();
    const deps = makeDeps(scheduler);
    deps.rooms.set('WAITING', prepareWaitingRoom('WAITING'));
    const context = createConnectionContext('test');

    await joinRoomFromLifecyclePayload(socket.ws, context, deps, mustParseJoin({
        roomId: 'WAITING',
        playerId: 'guest'
    }));

    assert.equal(socket.messages[0]?.type, 'PLAYER_JOINED');
    assert.equal(context.currentRoomId, 'WAITING');
    assert.equal(context.currentPlayerId, 'guest');
    assert.equal(deps.rooms.get('WAITING')?.gameState?.phase, 'waiting');
    assert.equal(scheduled[0]?.delayMs, 1000);
});

test('joinRoomFromLifecyclePayload preserves reconnect and active-game rejection behavior', async () => {
    const reconnectSocket = makeSocket();
    const activeSocket = makeSocket();
    const deps = makeDeps();
    const reconnectRoom = prepareWaitingRoom('RECONNECT');
    reconnectRoom.gameState = { phase: 'playing' } as NonNullable<typeof reconnectRoom.gameState>;
    reconnectRoom.buildClientGameState = () => ({ phase: 'playing', marker: 'viewer-safe' } as unknown as NonNullable<typeof reconnectRoom.gameState>);
    deps.rooms.set('RECONNECT', reconnectRoom);
    const activeRoom = prepareWaitingRoom('ACTIVE');
    activeRoom.gameState = { phase: 'playing' } as NonNullable<typeof activeRoom.gameState>;
    deps.rooms.set('ACTIVE', activeRoom);

    await joinRoomFromLifecyclePayload(reconnectSocket.ws, createConnectionContext('test'), deps, mustParseJoin({
        roomId: 'RECONNECT',
        playerId: 'host',
        roomSessionToken: 'host-token'
    }));
    await joinRoomFromLifecyclePayload(activeSocket.ws, createConnectionContext('test'), deps, mustParseJoin({
        roomId: 'ACTIVE',
        playerId: 'guest'
    }));

    assert.deepEqual(reconnectSocket.messages[0], {
        type: 'GAME_STATE_UPDATED',
        payload: { phase: 'playing', marker: 'viewer-safe' }
    });
    assert.equal(activeSocket.messages[0]?.payload?.code, 'ROOM_ALREADY_STARTED');
});
