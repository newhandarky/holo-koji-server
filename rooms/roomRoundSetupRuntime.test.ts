import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
} from '../game/geishaSetRules.js';
import { createRandomizedGeishas } from '../game/geishaBoardFactory.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from '../game/serverGameStateTypes.js';
import {
    ensureRoomBaseGeishas,
    prepareRoomRoundState,
    regenerateRoomBaseGeishas,
    validateRoomRoundSetup
} from './roomRoundSetupRuntime.js';
import { GEISHA_SET_CONFIG_ERROR_MESSAGE } from './roomErrors.js';

const makeRoom = (overrides: Partial<{
    players: Array<{ playerId: string }>;
    geishaSet: GeishaSet;
    setupMode: RoomSetupMode;
    customSelection: CustomCharacterSelection | null;
    baseGeishas: Geisha[] | null;
    gameState: ServerGameState | null;
}> = {}) => {
    const errors: Array<{ playerId: string; message: string }> = [];
    const room = {
        roomId: 'round-setup-runtime',
        hostId: 'host' as string | null,
        players: overrides.players ?? [{ playerId: 'host' }, { playerId: 'guest' }],
        geishaSet: overrides.geishaSet ?? DEFAULT_GEISHA_SET,
        setupMode: overrides.setupMode ?? 'random',
        customSelection: overrides.customSelection ?? null,
        baseGeishas: overrides.baseGeishas ?? null,
        dealSequence: [],
        gameState: overrides.gameState ?? null,
        getPlayerMetaMap: (): PlayerMetaMap => ({
            host: { name: 'Host' },
            guest: { name: 'Guest' }
        }),
        sendError: (playerId: string, message: string) => {
            errors.push({ playerId, message });
        },
        validateRoundSetup: () => {
            validateRoomRoundSetup(room);
        },
        errors
    };
    return room;
};

test('regenerateRoomBaseGeishas creates seven random geishas', () => {
    const room = makeRoom();

    assert.equal(regenerateRoomBaseGeishas(room), true);

    assert.equal(room.baseGeishas?.length, 7);
});

test('regenerateRoomBaseGeishas sends errors to all players for invalid custom setup', () => {
    const room = makeRoom({
        setupMode: 'custom',
        customSelection: { characterIds: ['missing'] }
    });

    assert.equal(regenerateRoomBaseGeishas(room), false);

    assert.deepEqual(room.errors, [
        { playerId: 'host', message: GEISHA_SET_CONFIG_ERROR_MESSAGE },
        { playerId: 'guest', message: GEISHA_SET_CONFIG_ERROR_MESSAGE }
    ]);
});

test('ensureRoomBaseGeishas keeps existing base geishas', () => {
    const existing = createRandomizedGeishas('default');
    const room = makeRoom({ baseGeishas: existing });

    assert.equal(ensureRoomBaseGeishas(room), true);

    assert.strictEqual(room.baseGeishas, existing);
});

test('prepareRoomRoundState does not create game state when players are insufficient', () => {
    const room = makeRoom({ players: [{ playerId: 'host' }] });

    prepareRoomRoundState(room);

    assert.equal(room.gameState, null);
});

test('prepareRoomRoundState applies prepared game state and deal sequence', () => {
    const room = makeRoom();

    prepareRoomRoundState(room, { openOrderDecision: false });

    assert.equal(room.gameState?.phase, 'playing');
    assert.equal(room.gameState?.players.length, 2);
    assert.equal(room.gameState?.players[0]?.name, 'Host');
    assert.equal(room.dealSequence.length, 12);
});

test('validateRoomRoundSetup is warning-only for diagnostics', () => {
    const room = makeRoom();
    prepareRoomRoundState(room, { openOrderDecision: false });
    assert.ok(room.gameState);
    room.gameState.drawPile = [];

    assert.doesNotThrow(() => validateRoomRoundSetup(room));
});
