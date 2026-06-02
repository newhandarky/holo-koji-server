import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../utils/gameUtils.js';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';
import {
    broadcastRoomGameStateEvent,
    buildRoomClientGameState,
    buildRoomDealSequenceForPlayer,
    sendRoomClientError,
    sendRoomPendingInteractionState
} from './roomClientEventRuntime.js';

const makeSocket = (messages: string[]): RoomSocketLike => ({
    readyState: 1,
    send: payload => {
        messages.push(payload);
    }
});

const makeSeat = (playerId: string, messages: string[]): RoomSeat => ({
    playerId,
    ws: makeSocket(messages)
});

const makePlayer = (id: string): Player => ({
    id,
    name: id,
    hand: [{ id: `${id}-hand`, geishaId: 1, type: 'item' }],
    playedCards: [],
    secretCards: [{ id: `${id}-secret`, geishaId: 1, type: 'item' }],
    discardedCards: [],
    actionTokens: [],
    score: { charm: 0, tokens: 0 }
});

const makeGameState = (): ServerGameState => ({
    gameId: 'client-event-runtime',
    players: [makePlayer('host'), makePlayer('guest')],
    geishas: [],
    drawPile: [{ id: 'draw', geishaId: 1, type: 'item' }],
    discardPile: [],
    currentPlayer: 0,
    phase: 'playing',
    round: 1,
    winner: null,
    orderDecision: {
        isOpen: false,
        phase: 'result',
        players: ['host', 'guest'],
        confirmations: ['host', 'guest'],
        waitingFor: [],
        currentPlayer: 'host'
    },
    pendingInteraction: null,
    lastAction: undefined
});

const makeRoom = () => {
    const hostMessages: string[] = [];
    const guestMessages: string[] = [];
    let persisted = 0;
    const room = {
        roomId: 'client-event-runtime',
        players: [
            makeSeat('host', hostMessages),
            makeSeat('guest', guestMessages)
        ],
        geishaSet: 'default' as const,
        gameState: makeGameState(),
        dealSequence: [{
            order: 0,
            playerId: 'host',
            card: { id: 'real-card', geishaId: 1, type: 'item' as const }
        }],
        persistRoomSnapshot: () => {
            persisted += 1;
        },
        get persisted() {
            return persisted;
        },
        hostMessages,
        guestMessages
    };
    return room;
};

const parseMessages = (messages: string[]) => messages.map(payload => JSON.parse(payload));

test('buildRoomClientGameState masks opponent private state and stamps room geisha set', () => {
    const room = makeRoom();

    const visible = buildRoomClientGameState(room, 'host');

    assert.equal(visible?.geishaSet, 'default');
    assert.equal(room.gameState?.geishaSet, 'default');
    assert.deepEqual(visible?.drawPile, []);
    assert.equal(visible?.players[1]?.hand[0]?.type, 'hidden');
    assert.deepEqual(visible?.players[1]?.secretCards, []);
});

test('broadcastRoomGameStateEvent sends viewer-safe payloads and persists once', () => {
    const room = makeRoom();

    broadcastRoomGameStateEvent(room, 'GAME_STATE_UPDATED');

    const hostPayload = parseMessages(room.hostMessages)[0];
    const guestPayload = parseMessages(room.guestMessages)[0];
    assert.equal(hostPayload.type, 'GAME_STATE_UPDATED');
    assert.equal(guestPayload.type, 'GAME_STATE_UPDATED');
    assert.equal(hostPayload.payload.players[1].hand[0].type, 'hidden');
    assert.equal(guestPayload.payload.players[0].hand[0].type, 'hidden');
    assert.equal(room.persisted, 1);
});

test('sendRoomPendingInteractionState hides pending choices from non-target players', () => {
    const room = makeRoom();
    const pending: PendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        offeredCards: [{ id: 'gift', geishaId: 1, type: 'item' }]
    };
    room.gameState.pendingInteraction = pending;

    sendRoomPendingInteractionState(room);

    assert.deepEqual(parseMessages(room.hostMessages)[0]?.payload, {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        offeredCards: []
    });
    assert.deepEqual(parseMessages(room.guestMessages)[0]?.payload, pending);
});

test('sendRoomClientError preserves optional error codes', () => {
    const room = makeRoom();

    sendRoomClientError(room, 'host', '缺少行動內容', 'INVALID_ACTION');
    sendRoomClientError(room, 'guest', '缺少行動內容');

    assert.deepEqual(parseMessages(room.hostMessages)[0], {
        type: 'ERROR',
        payload: { message: '缺少行動內容', code: 'INVALID_ACTION' }
    });
    assert.deepEqual(parseMessages(room.guestMessages)[0], {
        type: 'ERROR',
        payload: { message: '缺少行動內容' }
    });
});

test('buildRoomDealSequenceForPlayer masks real deal card identity', () => {
    const room = makeRoom();

    const deal = buildRoomDealSequenceForPlayer(room, 'guest');

    assert.deepEqual(deal[0]?.card, {
        id: 'hidden-guest-deal-0',
        geishaId: 0,
        type: 'hidden'
    });
});
