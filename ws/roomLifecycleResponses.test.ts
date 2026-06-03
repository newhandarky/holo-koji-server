import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { createConnectionContext } from './connectionContext.js';
import {
    rejectAttachedConnection,
    sendGameStateUpdated,
    sendLifecycleError,
    sendPlayerJoined,
    sendRoomCreated
} from './roomLifecycleResponses.js';

type CapturedMessage = {
    type: string;
    payload?: Record<string, unknown>;
};

const makeSocket = (): { ws: WebSocket; messages: CapturedMessage[] } => {
    const messages: CapturedMessage[] = [];
    return {
        ws: {
            send: (payload: string) => {
                messages.push(JSON.parse(payload) as CapturedMessage);
            }
        } as unknown as WebSocket,
        messages
    };
};

test('lifecycle response helpers preserve existing wire payloads', () => {
    const socket = makeSocket();

    sendLifecycleError(socket.ws, '房間不存在', 'ROOM_NOT_FOUND');
    sendRoomCreated(socket.ws, 'ROOM01', 'host', 'host-token');
    sendPlayerJoined(socket.ws, 'ROOM01', 'guest', 'guest-token');
    sendGameStateUpdated(socket.ws, { phase: 'playing' });

    assert.deepEqual(socket.messages, [
        { type: 'ERROR', payload: { message: '房間不存在', code: 'ROOM_NOT_FOUND' } },
        { type: 'ROOM_CREATED', payload: { roomId: 'ROOM01', playerId: 'host', roomSessionToken: 'host-token' } },
        { type: 'PLAYER_JOINED', payload: { roomId: 'ROOM01', playerId: 'guest', roomSessionToken: 'guest-token' } },
        { type: 'GAME_STATE_UPDATED', payload: { phase: 'playing' } }
    ]);
});

test('rejectAttachedConnection sends ALREADY_IN_ROOM only for attached contexts', () => {
    const unattached = makeSocket();
    const attached = makeSocket();
    const unattachedContext = createConnectionContext('test');
    const attachedContext = createConnectionContext('test');
    attachedContext.currentRoomId = 'ROOM01';
    attachedContext.currentPlayerId = 'host';

    assert.equal(rejectAttachedConnection(unattached.ws, unattachedContext), false);
    assert.equal(rejectAttachedConnection(attached.ws, attachedContext), true);
    assert.deepEqual(attached.messages[0], {
        type: 'ERROR',
        payload: { message: '目前已在房間內', code: 'ALREADY_IN_ROOM' }
    });
});
