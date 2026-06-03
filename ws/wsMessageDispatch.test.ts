import test from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import type { AccountSyncRequest } from '@newhandarky/hanakoji-game-types';
import type { AccountStore } from '../utils/accountStore.js';
import { createConnectionContext } from './connectionContext.js';
import type { WebSocketRoomLike } from './roomHandlerTypes.js';
import {
    dispatchWebSocketMessage,
    type WebSocketMessageDispatchDependencies
} from './wsMessageDispatch.js';
import type { ParsedWebSocketMessage } from './wsMessageParser.js';

type Call = {
    method: string;
    args: unknown[];
};

const makeSocket = (): WebSocket => ({
    send: () => {}
}) as unknown as WebSocket;

const makeRoom = (calls: Call[]): WebSocketRoomLike => ({
    maxPlayers: 2,
    hostId: null,
    players: [],
    gameState: null,
    baseGeishas: null,
    geishaSet: 'default',
    setupMode: 'random',
    customSelection: null,
    npcId: null,
    npcDifficulty: null,
    createdAt: 1,
    matchCompletionCounter: 0,
    currentCompletionId: null,
    confirmOrder: (playerId: string) => calls.push({ method: 'confirmOrder', args: [playerId] }),
    handleAction: (playerId, action) => calls.push({ method: 'handleAction', args: [playerId, action] }),
    sendError: (playerId, message, code) => calls.push({ method: 'sendError', args: [playerId, message, code] }),
    confirmReady: (playerId: string) => calls.push({ method: 'confirmReady', args: [playerId] }),
    requestRematch: (playerId: string) => calls.push({ method: 'requestRematch', args: [playerId] }),
    regenerateBaseGeishas: () => true,
    addPlayer: () => 'added',
    addNpcPlayer: () => null,
    getPlayerMetaMap: () => ({}),
    broadcastGameState: () => {},
    persistRoomSnapshot: () => {},
    ensureBaseGeishas: () => true,
    buildClientGameState: () => null,
    startOrderDecision: () => {},
    detachPlayerConnection: () => true,
    removePlayer: () => true,
    broadcast: () => {}
});

const makeDeps = (room: WebSocketRoomLike): WebSocketMessageDispatchDependencies<WebSocketRoomLike> => ({
    rooms: new Map([['ROOM01', room]]),
    createRoom: () => room,
    loadRoomSnapshot: async () => null,
    deleteRoomSnapshot: async () => {},
    accountStore: {} as AccountStore,
    resolveVerifiedLineAccountRequest: async (payload?: AccountSyncRequest) => payload ?? null
});

test('dispatchWebSocketMessage routes known game messages through existing handlers', async () => {
    const calls: Call[] = [];
    const room = makeRoom(calls);
    const deps = makeDeps(room);
    const context = createConnectionContext('test');
    context.currentRoomId = 'ROOM01';
    context.currentPlayerId = 'host';

    const gameActionMessage = {
        type: 'GAME_ACTION',
        payload: { action: { type: 'PLAY_SECRET', payload: { playerId: 'host', cardId: 'card-1' } } }
    } as ParsedWebSocketMessage;

    await dispatchWebSocketMessage(makeSocket(), gameActionMessage, context, deps);
    await dispatchWebSocketMessage(makeSocket(), { type: 'CONFIRM_ORDER' }, context, deps);
    await dispatchWebSocketMessage(makeSocket(), { type: 'READY_CONFIRM' }, context, deps);
    await dispatchWebSocketMessage(makeSocket(), { type: 'REMATCH_REQUEST' }, context, deps);

    assert.deepEqual(calls, [
        { method: 'handleAction', args: ['host', { type: 'PLAY_SECRET', payload: { playerId: 'host', cardId: 'card-1' } }] },
        { method: 'confirmOrder', args: ['host'] },
        { method: 'confirmReady', args: ['host'] },
        { method: 'requestRematch', args: ['host'] }
    ]);
});

test('dispatchWebSocketMessage ignores unknown message types without throwing', async () => {
    const room = makeRoom([]);
    const deps = makeDeps(room);
    const context = createConnectionContext('test');

    const message = {
        type: 'NOT_A_MESSAGE',
        payload: { ignored: true }
    } as ParsedWebSocketMessage;

    await assert.doesNotReject(dispatchWebSocketMessage(makeSocket(), message, context, deps));
});
