import test from 'node:test';
import assert from 'node:assert/strict';
import {
    publishRoomActiveActionResult,
    publishRoomInteractionResolved
} from './roomActionEvents.js';
import type { WireMessage } from './roomMessaging.js';

const createRecordingRoom = () => {
    const calls: Array<{ name: string; args?: unknown[] }> = [];
    return {
        room: {
            players: [{ playerId: 'host' }, { playerId: 'guest' }],
            sendToPlayer: (playerId: string, message: WireMessage) => {
                calls.push({ name: 'sendToPlayer', args: [playerId, message] });
            },
            broadcast: (message: WireMessage) => {
                calls.push({ name: 'broadcast', args: [message] });
            },
            broadcastGameState: () => {
                calls.push({ name: 'broadcastGameState' });
            },
            endTurn: () => {
                calls.push({ name: 'endTurn' });
            }
        },
        calls
    };
};

test('publishRoomActiveActionResult redacts revealed cards for other players before ending turn', () => {
    const { room, calls } = createRecordingRoom();

    publishRoomActiveActionResult(room, {
        playerId: 'host',
        action: 'secret',
        revealedCardIds: ['card-1']
    });

    assert.deepEqual(calls, [
        {
            name: 'sendToPlayer',
            args: [
                'host',
                {
                    type: 'ACTION_EXECUTED',
                    payload: {
                        playerId: 'host',
                        action: 'secret',
                        cardIds: ['card-1']
                    }
                }
            ]
        },
        {
            name: 'sendToPlayer',
            args: [
                'guest',
                {
                    type: 'ACTION_EXECUTED',
                    payload: {
                        playerId: 'host',
                        action: 'secret',
                        cardIds: []
                    }
                }
            ]
        },
        { name: 'broadcastGameState' },
        { name: 'endTurn' }
    ]);
});

test('publishRoomInteractionResolved broadcasts resolved event before state and turn advance', () => {
    const { room, calls } = createRecordingRoom();

    publishRoomInteractionResolved(room, {
        interaction: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        chosenCardId: 'card-2'
    });

    assert.deepEqual(calls, [
        {
            name: 'broadcast',
            args: [
                {
                    type: 'INTERACTION_RESOLVED',
                    payload: {
                        interaction: 'GIFT_SELECTION',
                        initiatorId: 'host',
                        targetPlayerId: 'guest',
                        chosenCardId: 'card-2'
                    }
                }
            ]
        },
        { name: 'broadcastGameState' },
        { name: 'endTurn' }
    ]);
});
