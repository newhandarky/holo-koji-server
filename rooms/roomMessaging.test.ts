import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import type {
    RoomSeat,
    RoomSocketLike
} from '../utils/roomSession.js';
import {
    broadcastRoomMessage,
    buildMaskedDealSequence,
    buildPendingInteractionMessages,
    buildViewerGameState,
    sendRoomMessage
} from './roomMessaging.js';

const makeSocket = (messages: string[], readyState = 1): RoomSocketLike => ({
    readyState,
    send: payload => {
        messages.push(payload);
    }
});

const makeSeat = (playerId: string, messages: string[], readyState = 1): RoomSeat => ({
    playerId,
    ws: makeSocket(messages, readyState)
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

test('sendRoomMessage serializes messages for connected players only', () => {
    const connected: string[] = [];
    const disconnected: string[] = [];
    const seats = [
        makeSeat('host', connected),
        makeSeat('guest', disconnected, 3)
    ];

    sendRoomMessage('room-a', seats, 'host', { type: 'PING', payload: { ok: true } });
    sendRoomMessage('room-a', seats, 'guest', { type: 'PING' });
    sendRoomMessage('room-a', seats, 'missing', { type: 'PING' });

    assert.deepEqual(connected.map(payload => JSON.parse(payload)), [{ type: 'PING', payload: { ok: true } }]);
    assert.deepEqual(disconnected, []);
});

test('sendRoomMessage and broadcastRoomMessage contain send failures', () => {
    const messages: string[] = [];
    const throwingSocket: RoomSocketLike = {
        readyState: 1,
        send: () => {
            throw new Error('send failed');
        }
    };
    const seats = [
        { playerId: 'broken', ws: throwingSocket },
        makeSeat('host', messages),
        makeSeat('guest', [], 3)
    ];

    assert.doesNotThrow(() => sendRoomMessage('room-a', seats, 'broken', { type: 'PING' }));
    assert.doesNotThrow(() => broadcastRoomMessage('room-a', seats, { type: 'PING' }, 'guest'));
    assert.deepEqual(messages.map(payload => JSON.parse(payload)), [{ type: 'PING' }]);
});

test('broadcastRoomMessage excludes the requested player', () => {
    const host: string[] = [];
    const guest: string[] = [];

    broadcastRoomMessage('room-a', [
        makeSeat('host', host),
        makeSeat('guest', guest)
    ], { type: 'READY_CHECK' }, 'guest');

    assert.equal(host.length, 1);
    assert.equal(guest.length, 0);
});

test('buildPendingInteractionMessages hides pending choices from non-target players', () => {
    const pending: PendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        offeredCards: [{ id: 'gift', geishaId: 1, type: 'item' }]
    };
    const messages = buildPendingInteractionMessages([
        makeSeat('host', []),
        makeSeat('guest', [])
    ], pending);

    assert.deepEqual(messages[0]?.message.payload, {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        offeredCards: []
    });
    assert.deepEqual(messages[1]?.message.payload, pending);
});

test('buildViewerGameState and buildMaskedDealSequence preserve hidden information rules', () => {
    const gameState = {
        gameId: 'room-a',
        players: [makePlayer('host'), makePlayer('guest')],
        geishas: [],
        drawPile: [{ id: 'draw', geishaId: 1, type: 'item' }],
        discardPile: [],
        currentPlayer: 0,
        phase: 'playing',
        round: 1,
        orderDecision: {
            isOpen: false,
            phase: 'result',
            players: ['host', 'guest'],
            confirmations: ['host', 'guest'],
            waitingFor: []
        },
        pendingInteraction: null,
        lastAction: undefined
    } as unknown as ServerGameState;

    const visible = buildViewerGameState(gameState, 'host', 'default');
    assert.deepEqual(visible?.drawPile, []);
    assert.equal(visible?.players[1]?.hand[0]?.type, 'hidden');
    assert.deepEqual(visible?.players[1]?.secretCards, []);

    const deal = buildMaskedDealSequence([{
        order: 0,
        playerId: 'host',
        card: { id: 'real-card', geishaId: 1, type: 'item' }
    }], 'guest');
    assert.deepEqual(deal[0]?.card, {
        id: 'hidden-guest-deal-0',
        geishaId: 0,
        type: 'hidden'
    });
});
