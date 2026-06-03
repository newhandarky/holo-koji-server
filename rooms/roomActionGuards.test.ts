import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    validateRoomActionAvailable,
    validateRoomPlayerInRoom,
    validateRoomPlayerTurn
} from './roomActionGuards.js';

const makePlayer = (id: string): ServerGameState['players'][number] => ({
    id,
    name: id,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: [
        { type: 'secret', used: false },
        { type: 'gift', used: true }
    ],
    score: { charm: 0, tokens: 0 }
} as ServerGameState['players'][number]);

const makeState = (): ServerGameState => ({
    players: [makePlayer('host'), makePlayer('guest')],
    currentPlayer: 0,
    phase: 'playing',
    pendingInteraction: null,
    geishas: []
} as unknown as ServerGameState);

test('validateRoomPlayerInRoom preserves membership errors', () => {
    const errors: string[] = [];
    const room = {
        players: [{ playerId: 'host' }],
        sendError: (_playerId: string, message: string) => {
            errors.push(message);
        }
    };

    assert.equal(validateRoomPlayerInRoom(room, 'host'), true);
    assert.equal(validateRoomPlayerInRoom(room, 'guest'), false);
    assert.deepEqual(errors, ['玩家不在房間內']);
});

test('validateRoomPlayerTurn preserves game and turn errors', () => {
    const errors: string[] = [];
    const room = {
        gameState: null as ServerGameState | null,
        sendError: (_playerId: string, message: string) => {
            errors.push(message);
        }
    };

    assert.equal(validateRoomPlayerTurn(room, 'host'), false);
    room.gameState = makeState();
    assert.equal(validateRoomPlayerTurn(room, 'guest'), false);
    assert.equal(validateRoomPlayerTurn(room, 'host'), true);
    assert.deepEqual(errors, ['遊戲尚未開始', '不是你的回合']);
});

test('validateRoomActionAvailable preserves action availability errors', () => {
    const errors: string[] = [];
    const player = makePlayer('host');
    const room = {
        sendError: (_playerId: string, message: string) => {
            errors.push(message);
        }
    };

    assert.equal(validateRoomActionAvailable(room, player, 'secret'), true);
    assert.equal(validateRoomActionAvailable(room, player, 'gift'), false);
    assert.deepEqual(errors, ['該行動已使用或不存在']);
});
