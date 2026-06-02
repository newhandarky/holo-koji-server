import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    confirmRoomReady,
    requestRoomRematch,
    startRoomReadyCheck,
    startRoomRematch
} from './roomMatchRuntime.js';
import type { TimerHandle } from './roomScheduler.js';

const makeRoom = () => {
    const broadcasts: Array<{ type: string; payload?: unknown }> = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    let startedGame = 0;
    let startedOrder = 0;
    let regenerated = 0;
    let clearedNpcTimers = 0;
    return {
        roomId: 'match-runtime',
        players: [{ playerId: 'host' }, { playerId: 'guest' }],
        gameState: {
            phase: 'deciding_order' as ServerGameState['phase']
        },
        npcId: null as string | null,
        npcDifficulty: 'easy' as 'easy' | 'medium' | 'hard' | 'expert' | 'hell',
        scheduler: {
            setTimeout: (callback: () => void, delayMs: number) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: () => {}
        },
        rematchConfirmations: new Set<string>(),
        readyConfirmations: new Set<string>(),
        lastRoundStarterId: 'host' as string | null,
        currentCompletionId: 'match-complete' as string | null,
        geishaSet: 'default' as const,
        setupMode: 'random' as const,
        orderDecisionState: {
            isDeciding: false,
            result: {
                firstPlayer: 'host',
                secondPlayer: 'guest',
                order: ['host', 'guest']
            },
            confirmations: new Set<string>()
        },
        validatePlayerInRoom: () => true,
        broadcast: (message: { type: string; payload?: unknown }) => {
            broadcasts.push(message);
        },
        clearNpcTimers: () => {
            clearedNpcTimers += 1;
        },
        regenerateBaseGeishas: () => {
            regenerated += 1;
            return true;
        },
        startOrderDecision: () => {
            startedOrder += 1;
        },
        startGameWithOrder: () => {
            startedGame += 1;
        },
        confirmReady: (_playerId: string) => {},
        broadcasts,
        scheduled,
        get startedGame() {
            return startedGame;
        },
        get startedOrder() {
            return startedOrder;
        },
        get regenerated() {
            return regenerated;
        },
        get clearedNpcTimers() {
            return clearedNpcTimers;
        }
    };
};

test('requestRoomRematch broadcasts single-player confirmations', () => {
    const room = makeRoom();

    requestRoomRematch(room, 'host');

    assert.deepEqual(room.broadcasts, [{
        type: 'REMATCH_REQUESTED',
        payload: { confirmations: ['host'] }
    }]);
});

test('requestRoomRematch auto-confirms npc rematches and starts rematch', () => {
    const room = makeRoom();
    room.players = [{ playerId: 'host' }, { playerId: 'NPC' }];
    room.npcId = 'NPC';

    requestRoomRematch(room, 'host');

    assert.equal(room.startedOrder, 1);
    assert.equal(room.clearedNpcTimers, 1);
    assert.equal(room.regenerated, 1);
});

test('startRoomReadyCheck broadcasts waiting state and schedules npc confirmation', () => {
    const room = makeRoom();
    room.players = [{ playerId: 'host' }, { playerId: 'NPC' }];
    room.npcId = 'NPC';
    room.npcDifficulty = 'hard';
    let confirmedNpc: string | null = null;
    room.confirmReady = (playerId: string) => {
        confirmedNpc = playerId;
    };

    startRoomReadyCheck(room);
    room.scheduled[0]?.callback();

    assert.deepEqual(room.broadcasts[0], {
        type: 'READY_CHECK',
        payload: {
            confirmations: [],
            waitingFor: ['host', 'NPC']
        }
    });
    assert.equal(room.scheduled[0]?.delayMs, 700);
    assert.equal(confirmedNpc, 'NPC');
});

test('confirmRoomReady ignores invalid phases and duplicate confirmations', () => {
    const invalid = makeRoom();
    invalid.gameState.phase = 'playing';
    confirmRoomReady(invalid, 'host');
    assert.deepEqual(invalid.broadcasts, []);

    const duplicate = makeRoom();
    duplicate.readyConfirmations = new Set(['host']);
    confirmRoomReady(duplicate, 'host');
    assert.deepEqual(duplicate.broadcasts, []);
});

test('confirmRoomReady broadcasts status and starts game when all players confirmed', () => {
    const room = makeRoom();

    confirmRoomReady(room, 'host');
    confirmRoomReady(room, 'guest');

    assert.deepEqual(room.broadcasts.at(-1), {
        type: 'READY_STATUS',
        payload: {
            confirmations: ['host', 'guest'],
            waitingFor: []
        }
    });
    assert.equal(room.startedGame, 1);
});

test('startRoomRematch resets match state before order decision', () => {
    const room = makeRoom();
    room.rematchConfirmations = new Set(['host', 'guest']);

    startRoomRematch(room);

    assert.equal(room.clearedNpcTimers, 1);
    assert.deepEqual(Array.from(room.rematchConfirmations), []);
    assert.equal(room.lastRoundStarterId, null);
    assert.equal(room.currentCompletionId, null);
    assert.equal(room.regenerated, 1);
    assert.equal(room.startedOrder, 1);
});
