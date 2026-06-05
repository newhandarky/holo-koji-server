import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './gameRoom.js';
import {
    confirmRoomOrder,
    decideRoomOrder,
    prepareRoomOrderDecisionState,
    startRoomGameWithOrder,
    type RoomOpeningRuntime
} from './roomOpeningRuntime.js';
import { createOrderDecisionState } from '../game/openingFlow.js';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import type { WireMessage } from './roomMessaging.js';
import type { TimerHandle } from './roomScheduler.js';

type RecordedCall = {
    name: string;
    args?: unknown[];
};

const makePlayer = (id: string): ServerGameState['players'][number] => ({
    id,
    name: id,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: [],
    score: { charm: 0, tokens: 0 }
} as ServerGameState['players'][number]);

const makeOpeningState = (): NonNullable<RoomOpeningRuntime['gameState']> => ({
    gameId: 'room-opening-runtime',
    round: 1,
    players: [makePlayer('host'), makePlayer('guest')],
    currentPlayer: 0,
    phase: 'deciding_order',
    pendingInteraction: null,
    drawPile: [],
    discardPile: [],
    geishas: [],
    orderDecision: {
        isOpen: true,
        phase: 'result',
        players: ['host', 'guest'],
        confirmations: [],
        waitingFor: ['host', 'guest']
    }
} as unknown as NonNullable<RoomOpeningRuntime['gameState']>);

const createOpeningRoom = (overrides: Partial<RoomOpeningRuntime> = {}) => {
    const calls: RecordedCall[] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const room: RoomOpeningRuntime = {
        roomId: 'room-opening-runtime',
        hostId: 'host',
        players: [
            { playerId: 'host' } as RoomOpeningRuntime['players'][number],
            { playerId: 'guest' } as RoomOpeningRuntime['players'][number]
        ],
        gameState: makeOpeningState(),
        baseGeishas: [],
        geishaSet: 'default',
        orderDecisionState: createOrderDecisionState(),
        readyConfirmations: new Set<string>(),
        dealSequence: [],
        lastRoundStarterId: null,
        npcId: null,
        npcDifficulty: null,
        scheduler: {
            setTimeout: (callback, delayMs) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: () => {}
        },
        ensureBaseGeishas: () => true,
        getPlayerMetaMap: () => ({}),
        validatePlayerInRoom: () => true,
        sendError: (playerId: string, message: string, code?: string) => {
            calls.push({ name: 'sendError', args: [playerId, message, code] });
        },
        sendToPlayer: (playerId: string, message: WireMessage) => {
            calls.push({ name: 'sendToPlayer', args: [playerId, message] });
        },
        broadcast: (message: WireMessage) => {
            calls.push({ name: 'broadcast', args: [message] });
        },
        broadcastGameState: () => {
            calls.push({ name: 'broadcastGameState' });
        },
        broadcastGameStateEvent: (eventType: string) => {
            calls.push({ name: 'broadcastGameStateEvent', args: [eventType] });
        },
        prepareRoundState: () => {
            calls.push({ name: 'prepareRoundState' });
            room.dealSequence = ['deal-step'];
        },
        buildDealSequenceForPlayer: (playerId: string) => [{ playerId }],
        beginTurnForCurrentPlayer: () => {
            calls.push({ name: 'beginTurnForCurrentPlayer' });
        },
        startReadyCheck: () => {
            calls.push({ name: 'startReadyCheck' });
        },
        startGameWithOrder: () => {
            calls.push({ name: 'startGameWithOrder' });
        },
        confirmOrder: (playerId: string) => {
            calls.push({ name: 'confirmOrder', args: [playerId] });
        },
        ...overrides
    };

    return { room, calls, scheduled };
};

test('prepareRoomOrderDecisionState preserves incomplete room gate', () => {
    const room = new GameRoom('room-opening-runtime');
    room.players = [];

    assert.equal(prepareRoomOrderDecisionState(room), false);
    assert.equal(room.gameState, null);
});

test('confirmRoomOrder preserves missing result and duplicate confirmation behavior', () => {
    const missingResult = createOpeningRoom();

    confirmRoomOrder(missingResult.room, 'host');

    assert.deepEqual(missingResult.calls, [
        { name: 'sendError', args: ['host', '順序尚未決定，請稍後再確認', undefined] }
    ]);
    assert.deepEqual(missingResult.scheduled, []);

    const duplicate = createOpeningRoom();
    duplicate.room.orderDecisionState.result = {
        firstPlayer: 'host',
        secondPlayer: 'guest',
        order: ['host', 'guest']
    };
    duplicate.room.orderDecisionState.confirmations = new Set(['host']);

    confirmRoomOrder(duplicate.room, 'host');

    assert.deepEqual(duplicate.calls, []);
    assert.deepEqual(duplicate.scheduled, []);
});

test('startRoomGameWithOrder refuses to deal before ready confirmations complete', () => {
    const { room, calls } = createOpeningRoom();
    room.orderDecisionState.result = {
        firstPlayer: 'host',
        secondPlayer: 'guest',
        order: ['host', 'guest']
    };
    room.orderDecisionState.confirmations = new Set(['host', 'guest']);

    startRoomGameWithOrder(room);

    assert.deepEqual(calls, []);
    assert.equal(room.dealSequence.length, 0);
});

test('startRoomGameWithOrder preserves start, deal animation, and begin turn order', () => {
    const { room, calls } = createOpeningRoom();
    room.orderDecisionState.result = {
        firstPlayer: 'host',
        secondPlayer: 'guest',
        order: ['host', 'guest']
    };
    room.orderDecisionState.confirmations = new Set(['host', 'guest']);
    room.readyConfirmations = new Set(['host', 'guest']);

    startRoomGameWithOrder(room);

    assert.deepEqual(calls.map(call => call.name), [
        'prepareRoundState',
        'broadcastGameStateEvent',
        'sendToPlayer',
        'sendToPlayer',
        'beginTurnForCurrentPlayer'
    ]);
    assert.equal(room.lastRoundStarterId, 'host');
    assert.equal(room.orderDecisionState.result, null);
    assert.deepEqual(Array.from(room.readyConfirmations), []);
});

test('decideRoomOrder preserves npc confirmation thinking delay', () => {
    const { room, scheduled } = createOpeningRoom({
        npcId: 'guest',
        npcDifficulty: 'hard'
    });

    decideRoomOrder(room);

    assert.equal(scheduled[0]?.delayMs, 700);
    scheduled[0]?.callback();
    assert.equal(room.orderDecisionState.result?.order.includes('guest'), true);
});
