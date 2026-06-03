import test from 'node:test';
import assert from 'node:assert/strict';
import type { LineAccountProfile } from '@newhandarky/hanakoji-game-types';
import { createConnectionContext } from './connectionContext.js';
import {
    applyBoundAccountProfileToCurrentRoom,
    type AccountBindingRoomLike
} from './accountRoomBindingRuntime.js';

const makeProfile = (): LineAccountProfile => ({
    lineUserId: 'line-host',
    displayName: 'Host',
    avatarUrl: 'https://example.com/avatar.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    counters: {
        gamesPlayed: 1,
        wins: 1,
        lastPlayedAt: '2026-01-02T00:00:00.000Z'
    }
});

const makeRoom = (): AccountBindingRoomLike & { broadcastCount: number; persistCount: number } => ({
    players: [
        { playerId: 'host' }
    ],
    gameState: {
        players: [
            { id: 'host' },
            { id: 'guest' }
        ]
    },
    broadcastCount: 0,
    persistCount: 0,
    broadcastGameState() {
        this.broadcastCount += 1;
    },
    persistRoomSnapshot() {
        this.persistCount += 1;
    }
});

test('applyBoundAccountProfileToCurrentRoom updates room seat and game state player then broadcasts and persists', () => {
    const profile = makeProfile();
    const room = makeRoom();
    const context = createConnectionContext('test');
    context.currentRoomId = 'ROOM01';
    context.currentPlayerId = 'host';
    context.currentAccountProfile = profile;

    const applied = applyBoundAccountProfileToCurrentRoom(context, new Map([['ROOM01', room]]));

    assert.equal(applied, true);
    assert.equal(room.players[0]?.accountProfile, profile);
    assert.equal(room.players[0]?.lineUserId, 'line-host');
    assert.equal(room.players[0]?.avatarUrl, 'https://example.com/avatar.png');
    assert.equal(room.gameState?.players[0]?.lineUserId, 'line-host');
    assert.equal(room.gameState?.players[0]?.avatarUrl, 'https://example.com/avatar.png');
    assert.equal(room.broadcastCount, 1);
    assert.equal(room.persistCount, 1);
});

test('applyBoundAccountProfileToCurrentRoom does not mutate when attachment or player is missing', () => {
    const profile = makeProfile();
    const room = makeRoom();
    const unattached = createConnectionContext('test');
    unattached.currentAccountProfile = profile;
    const missingPlayer = createConnectionContext('test');
    missingPlayer.currentRoomId = 'ROOM01';
    missingPlayer.currentPlayerId = 'missing';
    missingPlayer.currentAccountProfile = profile;

    assert.equal(applyBoundAccountProfileToCurrentRoom(unattached, new Map([['ROOM01', room]])), false);
    assert.equal(applyBoundAccountProfileToCurrentRoom(missingPlayer, new Map([['ROOM01', room]])), false);
    assert.equal(room.players[0]?.accountProfile, undefined);
    assert.equal(room.gameState?.players[0]?.lineUserId, undefined);
    assert.equal(room.broadcastCount, 0);
    assert.equal(room.persistCount, 0);
});
