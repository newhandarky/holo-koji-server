import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRoomAction } from './roomActionRuntime.js';
import type { ServerAction } from '../game/actionValidation.js';

test('handleRoomAction preserves missing game state error dispatch', () => {
    const errors: string[] = [];
    const room = {
        roomId: 'room-action-runtime',
        gameState: null,
        players: [],
        sendToPlayer: () => {},
        sendError: (_playerId: string, message: string) => {
            errors.push(message);
        },
        validatePlayerInRoom: () => false,
        validatePlayerTurn: () => false,
        validateActionAvailable: () => false,
        getPlayerState: () => null,
        getOpponentId: () => null,
        sendPendingInteractionState: () => {},
        broadcast: () => {},
        broadcastGameState: () => {},
        endTurn: () => {},
        isNpcPlayerId: () => false,
        scheduleNpcResponse: () => {}
    };

    handleRoomAction(room, 'host', { type: 'PLAY_SECRET' } as ServerAction);

    assert.deepEqual(errors, ['遊戲尚未準備完成']);
});
