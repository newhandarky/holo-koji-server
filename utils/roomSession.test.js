import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRestoredRoomSeats } from './roomSession.js';

test('restores human room seats with disconnected sockets and session tokens', () => {
    const seats = buildRestoredRoomSeats({
        players: [
            {
                playerId: 'host',
                name: 'Host',
                lineUserId: 'line-host',
                avatarUrl: 'https://example.test/host.png',
                sessionToken: 'host-token'
            },
            {
                playerId: 'npc',
                name: 'NPC',
                isNpc: true,
                sessionToken: 'npc-token'
            }
        ],
        gameState: {
            players: [
                { id: 'host', name: 'Host' },
                { id: 'guest', name: 'Guest' }
            ]
        }
    });

    assert.deepEqual(
        seats.map((seat) => ({
            playerId: seat.playerId,
            name: seat.name,
            lineUserId: seat.lineUserId,
            avatarUrl: seat.avatarUrl,
            sessionToken: seat.sessionToken,
            isNpc: Boolean(seat.isNpc),
            readyState: seat.ws.readyState
        })),
        [
            {
                playerId: 'host',
                name: 'Host',
                lineUserId: 'line-host',
                avatarUrl: 'https://example.test/host.png',
                sessionToken: 'host-token',
                isNpc: false,
                readyState: 3
            },
            {
                playerId: 'npc',
                name: 'NPC',
                lineUserId: undefined,
                avatarUrl: undefined,
                sessionToken: 'npc-token',
                isNpc: true,
                readyState: 1
            },
            {
                playerId: 'guest',
                name: 'Guest',
                lineUserId: undefined,
                avatarUrl: undefined,
                sessionToken: undefined,
                isNpc: false,
                readyState: 3
            }
        ]
    );
});
