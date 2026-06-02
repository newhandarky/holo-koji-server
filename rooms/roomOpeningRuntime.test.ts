import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './gameRoom.js';
import { prepareRoomOrderDecisionState } from './roomOpeningRuntime.js';

test('prepareRoomOrderDecisionState preserves incomplete room gate', () => {
    const room = new GameRoom('room-opening-runtime');
    room.players = [];

    assert.equal(prepareRoomOrderDecisionState(room), false);
    assert.equal(room.gameState, null);
});
