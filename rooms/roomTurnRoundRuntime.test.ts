import test from 'node:test';
import assert from 'node:assert/strict';
import type { ItemCard } from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    beginRoomTurnForCurrentPlayer,
    endRoomTurn,
    resolveRoomRound,
    scheduleRoomNextRound
} from './roomTurnRoundRuntime.js';
import type { TimerHandle } from './roomScheduler.js';
import type { WireMessage } from './roomMessaging.js';
import type { RoomTurnRoundRuntime } from './roomTurnRoundRuntime.js';

type RecordedCall = {
    name: string;
    args?: unknown[];
};

type DrawPayload = {
    playerId: string;
    card: ItemCard;
};

const makeCard = (id: string, geishaId = 1): ItemCard => ({
    id,
    geishaId,
    type: 'item'
});

const makePlayer = (
    id: string,
    overrides: Partial<ServerGameState['players'][number]> = {}
): ServerGameState['players'][number] => ({
    id,
    name: id,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as const).map((type) => ({
        type,
        used: false
    })),
    score: { charm: 0, tokens: 0 },
    ...overrides
} as ServerGameState['players'][number]);

const makeState = (
    overrides: Partial<ServerGameState> = {}
): ServerGameState => ({
    players: [makePlayer('host'), makePlayer('guest')],
    currentPlayer: 0,
    phase: 'playing',
    pendingInteraction: null,
    drawPile: [],
    geishas: [
        { id: 1, name: 'Geisha 1', charmPoints: 5 },
        { id: 2, name: 'Geisha 2', charmPoints: 3 },
        { id: 3, name: 'Geisha 3', charmPoints: 2 },
        { id: 4, name: 'Geisha 4', charmPoints: 2 }
    ],
    round: 1,
    orderDecision: {
        isOpen: false,
        phase: 'idle',
        players: [],
        confirmations: [],
        waitingFor: []
    },
    ...overrides
} as unknown as ServerGameState);

const createRoom = (overrides: Partial<RoomTurnRoundRuntime> = {}) => {
    const calls: RecordedCall[] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const state = overrides.gameState === undefined ? makeState() : overrides.gameState;
    const room: RoomTurnRoundRuntime = {
        roomId: 'room-turn-round-runtime',
        gameState: state,
        players: [{ playerId: 'host' }, { playerId: 'guest' }] as RoomTurnRoundRuntime['players'],
        scheduler: {
            setTimeout: (callback: () => void, delayMs: number) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: (timer: TimerHandle) => {
                calls.push({ name: 'clearTimeout', args: [timer] });
            }
        },
        roundResolveTimer: null,
        lastRoundStarterId: 'host',
        baseGeishas: null,
        dealSequence: [],
        matchCompletionCounter: 0,
        currentCompletionId: null,
        sendToPlayer: (playerId: string, message: WireMessage) => {
            calls.push({ name: 'sendToPlayer', args: [playerId, message] });
        },
        broadcast: (message: WireMessage) => {
            calls.push({ name: 'broadcast', args: [message] });
        },
        broadcastGameState: () => {
            calls.push({ name: 'broadcastGameState' });
        },
        beginTurnForCurrentPlayer: () => {
            calls.push({ name: 'beginTurnForCurrentPlayer' });
        },
        endTurn: () => {
            calls.push({ name: 'endTurn' });
        },
        resolveRound: () => {
            calls.push({ name: 'resolveRound' });
        },
        startNextRound: () => {
            calls.push({ name: 'startNextRound' });
        },
        scheduleNextRound: () => {
            calls.push({ name: 'scheduleNextRound' });
        },
        scheduleNpcTurn: () => {
            calls.push({ name: 'scheduleNpcTurn' });
        },
        isNpcPlayerId: () => false,
        buildDealSequenceForPlayer: (playerId: string) => [{ playerId }],
        prepareRoundState: (options = {}) => {
            calls.push({ name: 'prepareRoundState', args: [options] });
            room.gameState = makeState({
                players: room.gameState?.players ?? [],
                geishas: room.gameState?.geishas ?? [],
                currentPlayer: 0,
                round: options.roundNumber ?? (room.gameState?.round ?? 1)
            });
        },
        ...overrides
    };

    return { room, calls, scheduled };
};

test('beginRoomTurnForCurrentPlayer sends visible self draw and hidden opponent draw before state broadcast', () => {
    const drawnCard = makeCard('drawn-card', 2);
    const { room, calls } = createRoom({
        gameState: makeState({ drawPile: [drawnCard] } as Partial<ServerGameState>)
    });

    beginRoomTurnForCurrentPlayer(room);

    assert.deepEqual(calls.map(call => call.name), [
        'sendToPlayer',
        'sendToPlayer',
        'broadcastGameState'
    ]);
    const selfMessage = calls[0]?.args?.[1] as WireMessage;
    const opponentMessage = calls[1]?.args?.[1] as WireMessage;
    assert.deepEqual(calls[0]?.args?.[0], 'host');
    assert.deepEqual(calls[1]?.args?.[0], 'guest');
    assert.equal(selfMessage.type, 'CARD_DRAWN');
    assert.equal((selfMessage.payload as DrawPayload).card.id, 'drawn-card');
    assert.equal(opponentMessage.type, 'CARD_DRAWN');
    assert.equal((opponentMessage.payload as DrawPayload).card.id, 'hidden-draw-host-0');
    assert.equal((opponentMessage.payload as DrawPayload).card.type, 'hidden');
    assert.equal(room.gameState?.players[0]?.hand[0]?.id, 'drawn-card');
    assert.equal(room.gameState?.drawPile.length, 0);
});

test('beginRoomTurnForCurrentPlayer skips exhausted current player through existing endTurn path', () => {
    const exhaustedHost = makePlayer('host', {
        actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as const).map((type) => ({
            type,
            used: true
        }))
    });
    const { room, calls } = createRoom({
        gameState: makeState({ players: [exhaustedHost, makePlayer('guest')] } as Partial<ServerGameState>)
    });

    beginRoomTurnForCurrentPlayer(room);

    assert.deepEqual(calls.map(call => call.name), ['endTurn']);
});

test('endRoomTurn advances to the next available player or resolves the round when all tokens are exhausted', () => {
    const nextPlayer = createRoom({
        gameState: makeState({ currentPlayer: 0 } as Partial<ServerGameState>)
    });

    endRoomTurn(nextPlayer.room);

    assert.equal(nextPlayer.room.gameState?.currentPlayer, 1);
    assert.deepEqual(nextPlayer.calls.map(call => call.name), ['beginTurnForCurrentPlayer']);

    const exhaustedPlayers = [
        makePlayer('host', {
            actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as const).map((type) => ({
                type,
                used: true
            }))
        }),
        makePlayer('guest', {
            actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as const).map((type) => ({
                type,
                used: true
            }))
        })
    ];
    const resolve = createRoom({
        gameState: makeState({ players: exhaustedPlayers } as Partial<ServerGameState>)
    });

    endRoomTurn(resolve.room);

    assert.deepEqual(resolve.calls.map(call => call.name), ['resolveRound']);
});

test('resolveRoomRound preserves winner settlement, game ended event order and completion id', () => {
    const removedCard = makeCard('removed-card', 4);
    const { room, calls } = createRoom({
        gameState: makeState({
            removedCard,
            players: [
                makePlayer('host', {
                    playedCards: [makeCard('host-1', 1), makeCard('host-2', 2), makeCard('host-3', 3), makeCard('host-4', 4)]
                }),
                makePlayer('guest', {
                    playedCards: []
                })
            ]
        } as Partial<ServerGameState>)
    });

    resolveRoomRound(room);

    assert.equal(room.gameState?.phase, 'ended');
    assert.equal(room.gameState?.winner, 'host');
    assert.equal(room.gameState?.settlement?.removedCard?.id, 'removed-card');
    assert.equal(room.currentCompletionId, 'room-turn-round-runtime:match-1:ended');
    assert.deepEqual(calls.map(call => call.name), [
        'broadcast',
        'broadcastGameState',
        'broadcast',
        'broadcastGameState'
    ]);
    assert.deepEqual((calls[0]?.args?.[0] as WireMessage).type, 'ROUND_COMPLETE');
    assert.deepEqual((calls[2]?.args?.[0] as WireMessage).type, 'GAME_ENDED');
});

test('resolveRoomRound schedules the next round when no winner is determined', () => {
    const { room, calls } = createRoom({
        gameState: makeState({
            players: [
                makePlayer('host', { playedCards: [makeCard('host-1', 1)] }),
                makePlayer('guest', { playedCards: [makeCard('guest-1', 2)] })
            ]
        } as Partial<ServerGameState>)
    });

    resolveRoomRound(room);

    assert.equal(room.gameState?.phase, 'resolution');
    assert.deepEqual(calls.map(call => call.name), [
        'broadcast',
        'broadcastGameState',
        'scheduleNextRound'
    ]);
    assert.equal((calls[0]?.args?.[0] as WireMessage).type, 'ROUND_COMPLETE');
});

test('scheduleRoomNextRound replaces stale round timers and invokes room next round', () => {
    const cleared: TimerHandle[] = [];
    const scheduled: Array<() => void> = [];
    let started = 0;
    const room = {
        roundResolveTimer: 1 as unknown as TimerHandle,
        scheduler: {
            setTimeout: (callback: () => void, delayMs: number) => {
                assert.equal(delayMs, 2500);
                scheduled.push(callback);
                return 2 as unknown as TimerHandle;
            },
            clearTimeout: (timer: TimerHandle) => {
                cleared.push(timer);
            }
        },
        startNextRound: () => {
            started += 1;
        }
    };

    scheduleRoomNextRound(room);
    scheduled[0]?.();

    assert.deepEqual(cleared, [1 as unknown as TimerHandle]);
    assert.equal(room.roundResolveTimer, null);
    assert.equal(started, 1);
});
