import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../rooms/gameRoom.js';
import { LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE } from '../rooms/roomErrors.js';
import {
    lookupRoomForJoin
} from './roomRestoreLookup.js';

const makeDeps = () => ({
    rooms: new Map<string, GameRoom>(),
    createRoom: (roomId: string) => new GameRoom(roomId),
    loadCount: 0,
    loadRoomSnapshot: async <TSnapshot,>(_roomId: string): Promise<TSnapshot | null> => {
        return null;
    },
    deleteRoomSnapshot: async (): Promise<void> => {}
});

test('lookupRoomForJoin returns existing room without loading snapshots', async () => {
    const deps = makeDeps();
    const room = new GameRoom('ROOM01');
    deps.rooms.set('ROOM01', room);
    deps.loadRoomSnapshot = async <TSnapshot,>(): Promise<TSnapshot | null> => {
        deps.loadCount += 1;
        return null;
    };

    const result = await lookupRoomForJoin('ROOM01', deps);

    assert.equal(result.room, room);
    assert.equal(result.errorMessage, null);
    assert.equal(deps.loadCount, 0);
});

test('lookupRoomForJoin reports restore failure without caching an invalid room', async () => {
    const deps = makeDeps();
    deps.loadRoomSnapshot = async <TSnapshot,>(): Promise<TSnapshot | null> => {
        return { roomId: 'BROKEN' } as TSnapshot;
    };

    const result = await lookupRoomForJoin('BROKEN', deps);

    assert.equal(result.room, null);
    assert.equal(result.errorMessage, LEGACY_ROOM_SNAPSHOT_ERROR_MESSAGE);
    assert.equal(deps.rooms.has('BROKEN'), false);
});
