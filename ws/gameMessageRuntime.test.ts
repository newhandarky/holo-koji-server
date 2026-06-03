import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionContext } from './connectionContext.js';
import type {
    MessageHandlerDependencies,
    RoomMessageHandlerLike
} from './roomHandlerTypes.js';
import {
    confirmRoomOrder,
    confirmRoomReady,
    handleRoomGameAction,
    requestRoomRematch
} from './gameMessageRuntime.js';

type Call = {
    method: string;
    args: unknown[];
};

const makeRoom = (calls: Call[]): RoomMessageHandlerLike => ({
    confirmOrder: (playerId: string) => calls.push({ method: 'confirmOrder', args: [playerId] }),
    handleAction: (playerId, action) => calls.push({ method: 'handleAction', args: [playerId, action] }),
    sendError: (playerId, message, code) => calls.push({ method: 'sendError', args: [playerId, message, code] }),
    confirmReady: (playerId: string) => calls.push({ method: 'confirmReady', args: [playerId] }),
    requestRematch: (playerId: string) => calls.push({ method: 'requestRematch', args: [playerId] })
});

const makeDeps = (room: RoomMessageHandlerLike): MessageHandlerDependencies<RoomMessageHandlerLike> => ({
    rooms: new Map([['ROOM01', room]])
});

const makeAttachedContext = () => {
    const context = createConnectionContext('test');
    context.currentRoomId = 'ROOM01';
    context.currentPlayerId = 'host';
    return context;
};

test('handleRoomGameAction sends the existing error when action content is missing', () => {
    const calls: Call[] = [];
    const deps = makeDeps(makeRoom(calls));

    handleRoomGameAction({}, makeAttachedContext(), deps);

    assert.deepEqual(calls, [
        { method: 'sendError', args: ['host', '缺少行動內容', undefined] }
    ]);
});

test('handleRoomGameAction delegates parsed actions to the current room', () => {
    const calls: Call[] = [];
    const deps = makeDeps(makeRoom(calls));

    handleRoomGameAction({
        action: {
            type: 'PLAY_SECRET',
            payload: {
                playerId: 'host',
                cardId: 'card-1'
            }
        }
    }, makeAttachedContext(), deps);

    assert.deepEqual(calls, [
        {
            method: 'handleAction',
            args: ['host', {
                type: 'PLAY_SECRET',
                payload: {
                    playerId: 'host',
                    cardId: 'card-1'
                }
            }]
        }
    ]);
});

test('game message commands return silently without room attachment or room lookup', () => {
    const calls: Call[] = [];
    const deps = makeDeps(makeRoom(calls));
    const unattached = createConnectionContext('test');
    const missingRoom = createConnectionContext('test');
    missingRoom.currentRoomId = 'MISSING';
    missingRoom.currentPlayerId = 'host';

    confirmRoomOrder(unattached, deps);
    confirmRoomReady(unattached, deps);
    requestRoomRematch(unattached, deps);
    handleRoomGameAction({ action: { type: 'PLAY_SECRET' } }, missingRoom, deps);

    assert.deepEqual(calls, []);
});

test('game message commands delegate to room methods when attached', () => {
    const calls: Call[] = [];
    const deps = makeDeps(makeRoom(calls));
    const context = makeAttachedContext();

    confirmRoomOrder(context, deps);
    confirmRoomReady(context, deps);
    requestRoomRematch(context, deps);

    assert.deepEqual(calls, [
        { method: 'confirmOrder', args: ['host'] },
        { method: 'confirmReady', args: ['host'] },
        { method: 'requestRematch', args: ['host'] }
    ]);
});
