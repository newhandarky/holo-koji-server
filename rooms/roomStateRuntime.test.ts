import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import { roomScheduler } from './roomScheduler.js';
import {
    createInitialRoomState,
    getRoomOpponentId,
    getRoomOpponentState,
    getRoomPlayerState,
    isRoomNpcPlayerId
} from './roomStateRuntime.js';

const makeGameState = (): ServerGameState => ({
    players: [
        {
            id: 'host',
            hand: [],
            playedCards: [],
            secretCards: [],
            discardedCards: [],
            actionTokens: [],
            score: { charm: 0, tokens: 0 }
        },
        {
            id: 'guest',
            hand: [],
            playedCards: [],
            secretCards: [],
            discardedCards: [],
            actionTokens: [],
            score: { charm: 0, tokens: 0 }
        }
    ],
    currentPlayer: 0,
    phase: 'playing',
    pendingInteraction: null,
    geishas: []
} as unknown as ServerGameState);

test('createInitialRoomState builds independent default room state', () => {
    const first = createInitialRoomState('room-a', roomScheduler);
    const second = createInitialRoomState('room-b', roomScheduler);

    assert.equal(first.roomId, 'room-a');
    assert.equal(first.maxPlayers, 2);
    assert.equal(first.hostId, null);
    assert.equal(first.gameState, null);
    assert.deepEqual(first.players, []);
    assert.equal(first.npcId, null);
    assert.equal(first.scheduler, roomScheduler);

    first.rematchConfirmations.add('host');
    first.readyConfirmations.add('guest');
    first.orderDecisionState.confirmations.add('host');

    assert.deepEqual(Array.from(second.rematchConfirmations), []);
    assert.deepEqual(Array.from(second.readyConfirmations), []);
    assert.deepEqual(Array.from(second.orderDecisionState.confirmations), []);
});

test('room query helpers find players and opponents without mutating state', () => {
    const room = {
        players: [
            { playerId: 'host' },
            { playerId: 'guest' }
        ],
        gameState: makeGameState(),
        npcId: 'guest'
    };

    const beforePlayers = room.players.map(player => player.playerId);

    assert.equal(isRoomNpcPlayerId(room, 'guest'), true);
    assert.equal(isRoomNpcPlayerId(room, 'host'), false);
    assert.equal(getRoomPlayerState(room, 'host')?.id, 'host');
    assert.equal(getRoomPlayerState(room, 'missing'), null);
    assert.equal(getRoomOpponentId(room, 'host'), 'guest');
    assert.equal(getRoomOpponentState(room, 'host')?.id, 'guest');
    assert.deepEqual(room.players.map(player => player.playerId), beforePlayers);
});
