import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    addRoomNpcSeat,
    buildNpcResponseAction,
    buildNpcSeat,
    buildNpcTurnAction,
    canScheduleNpcResponse,
    canScheduleNpcTurn,
    clearRoomNpcTimers,
    performRoomNpcAction,
    performRoomNpcResponse,
    scheduleRoomNpcResponse,
    scheduleRoomNpcTurn
} from './roomNpcRuntime.js';
import type { TimerHandle } from './roomScheduler.js';
import {
    createDisconnectedSocket,
    type RoomSeat
} from '../utils/roomSession.js';

const makeState = (): ServerGameState => ({
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
            id: 'NPC',
            hand: [],
            playedCards: [],
            secretCards: [],
            discardedCards: [],
            actionTokens: [],
            score: { charm: 0, tokens: 0 }
        }
    ],
    currentPlayer: 1,
    phase: 'playing',
    pendingInteraction: null,
    geishas: []
} as unknown as ServerGameState);

test('buildNpcSeat normalizes difficulty and creates an open fake socket', () => {
    const easy = buildNpcSeat('invalid');
    const expert = buildNpcSeat('expert');

    assert.equal(easy.difficulty, 'easy');
    assert.equal(easy.npcId, 'しぐれうい');
    assert.equal(easy.seat.ws.readyState, 1);
    assert.equal(expert.difficulty, 'expert');
    assert.equal(expert.seat.name, expert.npcId);
});

test('addRoomNpcSeat adds one npc seat and preserves duplicate/full guards', () => {
    const room = {
        roomId: 'npc-seat-runtime',
        players: [{ playerId: 'host', ws: createDisconnectedSocket() }] as RoomSeat[],
        maxPlayers: 2,
        npcId: null as string | null,
        npcDifficulty: null as 'easy' | 'hard' | null
    };

    const npcId = addRoomNpcSeat(room, 'hard');

    assert.equal(npcId, '兎田ぺこら');
    assert.equal(room.npcId, '兎田ぺこら');
    assert.equal(room.npcDifficulty, 'hard');
    assert.equal(room.players.length, 2);
    assert.equal(room.players[1]?.isNpc, true);
    assert.equal(addRoomNpcSeat(room, 'expert'), null);

    const fullRoom = {
        roomId: 'npc-full-runtime',
        players: [
            { playerId: 'host', ws: createDisconnectedSocket() },
            { playerId: 'guest', ws: createDisconnectedSocket() }
        ] as RoomSeat[],
        maxPlayers: 2,
        npcId: null as string | null,
        npcDifficulty: null as 'easy' | 'hard' | null
    };
    assert.equal(addRoomNpcSeat(fullRoom, 'hard'), null);
});

test('canScheduleNpcTurn enforces player, phase and pending interaction gates', () => {
    const gameState = makeState();

    assert.equal(canScheduleNpcTurn(gameState, 'NPC'), true);
    assert.equal(canScheduleNpcTurn({ ...gameState, currentPlayer: 0 }, 'NPC'), false);
    assert.equal(canScheduleNpcTurn({ ...gameState, phase: 'waiting' }, 'NPC'), false);
    assert.equal(canScheduleNpcTurn({
        ...gameState,
        pendingInteraction: { type: 'GIFT_SELECTION', targetPlayerId: 'NPC', initiatorId: 'host', offeredCards: [] }
    }, 'NPC'), false);
});

test('canScheduleNpcResponse requires an npc target', () => {
    assert.equal(canScheduleNpcResponse({
        type: 'GIFT_SELECTION',
        targetPlayerId: 'NPC',
        initiatorId: 'host',
        offeredCards: []
    }, 'NPC'), true);
    assert.equal(canScheduleNpcResponse({
        type: 'GIFT_SELECTION',
        targetPlayerId: 'host',
        initiatorId: 'NPC',
        offeredCards: []
    }, 'NPC'), false);
});

test('buildNpcResponseAction creates existing gift and competition response payloads immutably', () => {
    const giftState = makeState();
    giftState.pendingInteraction = {
        type: 'GIFT_SELECTION',
        targetPlayerId: 'NPC',
        initiatorId: 'host',
        offeredCards: [{ id: 'gift', geishaId: 1, type: 'item' }]
    };
    const competitionState = makeState();
    competitionState.pendingInteraction = {
        type: 'COMPETITION_SELECTION',
        targetPlayerId: 'NPC',
        initiatorId: 'host',
        groups: [
            [{ id: 'group-a', geishaId: 1, type: 'item' }],
            [{ id: 'group-b', geishaId: 2, type: 'item' }]
        ]
    };

    assert.deepEqual(buildNpcResponseAction(giftState, 'NPC', 'hard'), {
        type: 'RESOLVE_GIFT',
        payload: { chosenCardId: 'gift' }
    });
    assert.deepEqual(buildNpcResponseAction(competitionState, 'NPC', 'hard'), {
        type: 'RESOLVE_COMPETITION',
        payload: { chosenGroupIndex: 0 }
    });
    assert.equal(giftState.pendingInteraction.offeredCards?.[0]?.id, 'gift');
});

test('buildNpcTurnAction delegates to the existing npc strategy without mutating state', () => {
    const gameState = makeState();
    gameState.players[1]!.hand = [{ id: 'secret', geishaId: 1, type: 'item' }];
    gameState.players[1]!.actionTokens = [{ type: 'secret', used: false }];

    assert.deepEqual(buildNpcTurnAction(gameState, 'NPC', 'hard'), {
        type: 'PLAY_SECRET',
        payload: { cardId: 'secret' }
    });
    assert.equal(gameState.players[1]?.hand[0]?.id, 'secret');
    assert.equal(gameState.players[1]?.actionTokens[0]?.used, false);
});

test('clearRoomNpcTimers clears action and response timers', () => {
    const cleared: TimerHandle[] = [];
    const room = {
        npcActionTimer: 1 as unknown as TimerHandle,
        npcResponseTimer: 2 as unknown as TimerHandle,
        scheduler: {
            setTimeout: (() => 0) as never,
            clearTimeout: (timer: TimerHandle) => {
                cleared.push(timer);
            }
        }
    };

    clearRoomNpcTimers(room);

    assert.deepEqual(cleared, [1 as unknown as TimerHandle, 2 as unknown as TimerHandle]);
    assert.equal(room.npcActionTimer, null);
    assert.equal(room.npcResponseTimer, null);
});

test('scheduleRoomNpcTurn and scheduleRoomNpcResponse replace stale timers with existing delays', () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const cleared: TimerHandle[] = [];
    const room = {
        roomId: 'npc-runtime',
        npcId: 'NPC',
        npcDifficulty: 'hard' as const,
        npcActionTimer: 1 as unknown as TimerHandle,
        npcResponseTimer: 2 as unknown as TimerHandle,
        gameState: makeState(),
        scheduler: {
            setTimeout: (callback: () => void, delayMs: number) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: (timer: TimerHandle) => {
                cleared.push(timer);
            }
        },
        performNpcAction: () => {},
        performNpcResponse: () => {}
    };

    scheduleRoomNpcTurn(room);
    room.gameState.pendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'NPC',
        offeredCards: []
    };
    scheduleRoomNpcResponse(room);

    assert.deepEqual(cleared, [1 as unknown as TimerHandle, 2 as unknown as TimerHandle]);
    assert.equal(scheduled[0]?.delayMs, 700);
    assert.equal(scheduled[1]?.delayMs, 700);
    assert.equal(room.npcActionTimer, 1 as unknown as TimerHandle);
    assert.equal(room.npcResponseTimer, 2 as unknown as TimerHandle);
});

test('performRoomNpcAction ends turn when no npc action can be built', () => {
    let ended = 0;
    let handled = 0;
    const room = {
        gameState: makeState(),
        npcId: 'NPC',
        npcDifficulty: 'easy' as const,
        endTurn: () => {
            ended += 1;
        },
        handleAction: () => {
            handled += 1;
        }
    };

    performRoomNpcAction(room);

    assert.equal(ended, 1);
    assert.equal(handled, 0);
});

test('performRoomNpcResponse dispatches built npc response actions', () => {
    const handled: Array<{ playerId: string; type: string }> = [];
    const gameState = makeState();
    gameState.pendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'NPC',
        offeredCards: [{ id: 'gift', geishaId: 1, type: 'item' }]
    };
    const room = {
        gameState,
        npcId: 'NPC',
        npcDifficulty: 'easy' as const,
        handleAction: (playerId: string, action: { type: string }) => {
            handled.push({ playerId, type: action.type });
        }
    };

    performRoomNpcResponse(room);

    assert.deepEqual(handled, [{ playerId: 'NPC', type: 'RESOLVE_GIFT' }]);
});
