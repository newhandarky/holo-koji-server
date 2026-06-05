import test from 'node:test';
import assert from 'node:assert/strict';
import type { Player } from '@newhandarky/hanakoji-game-types';
import { GameRoom } from './gameRoom.js';
import {
    restoreRoomFromSnapshot,
    type RestorableRoomSnapshot
} from './roomRestore.js';
import {
    createDisconnectedSocket,
    type RoomSocketLike
} from '../utils/roomSession.js';
import type {
    RoomScheduler,
    TimerHandle
} from './roomScheduler.js';

type CapturedMessage = {
    type: string;
    payload?: unknown;
};

const makePlayer = (id: string): Player => ({
    id,
    name: id,
    hand: [{ id: `${id}-hand`, geishaId: 1, type: 'item' }],
    playedCards: [],
    secretCards: [{ id: `${id}-secret`, geishaId: 1, type: 'item' }],
    discardedCards: [],
    actionTokens: [],
    score: { charm: 0, tokens: 0 }
});

const createCapturingSocket = (): { ws: RoomSocketLike; messages: CapturedMessage[] } => {
    const messages: CapturedMessage[] = [];
    return {
        ws: {
            readyState: 1,
            send: payload => {
                messages.push(JSON.parse(payload) as CapturedMessage);
            }
        },
        messages
    };
};

const createFakeScheduler = (): {
    scheduler: RoomScheduler;
    scheduled: Array<{ callback: () => void; delayMs: number }>;
    cleared: TimerHandle[];
} => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const cleared: TimerHandle[] = [];
    return {
        scheduler: {
            setTimeout: (callback, delayMs) => {
                scheduled.push({ callback, delayMs });
                return scheduled.length as unknown as TimerHandle;
            },
            clearTimeout: timer => {
                cleared.push(timer);
            }
        },
        scheduled,
        cleared
    };
};

test('GameRoom module constructs default room state without starting the server entrypoint', () => {
    const room = new GameRoom('room-default');

    assert.equal(room.roomId, 'room-default');
    assert.equal(room.maxPlayers, 2);
    assert.equal(room.hostId, null);
    assert.equal(room.gameState, null);
    assert.deepEqual(room.players, []);
    assert.equal(room.npcId, null);
});

test('GameRoom snapshot serializes seats without socket objects', () => {
    const room = new GameRoom('room-snapshot');
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];

    const snapshot = room.buildRoomSnapshot();
    const seats = snapshot.players as Array<Record<string, unknown>>;

    assert.equal(seats.length, 1);
    assert.deepEqual(seats[0], {
        playerId: 'host',
        name: 'Host',
        lineUserId: undefined,
        avatarUrl: undefined,
        accountProfile: undefined,
        sessionToken: 'host-token',
        isNpc: false
    });
    assert.equal('ws' in (seats[0] ?? {}), false);
});

test('GameRoom remains compatible with room snapshot restore', () => {
    const room = new GameRoom('room-restore');
    room.hostId = 'host';
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];
    assert.equal(room.regenerateBaseGeishas(), true);

    const result = restoreRoomFromSnapshot(
        room.buildRoomSnapshot() as RestorableRoomSnapshot,
        { createRoom: roomId => new GameRoom(roomId) }
    );

    assert.equal(result.errorMessage, null);
    assert.equal(result.room?.roomId, 'room-restore');
    assert.equal(result.room?.hostId, 'host');
    assert.equal(result.room?.players[0]?.playerId, 'host');
    assert.equal(result.room?.players[0]?.ws.readyState, 3);
    assert.equal(result.room?.baseGeishas?.length, 7);
});

test('GameRoom facade routes viewer-safe state through client event runtime', () => {
    const host = createCapturingSocket();
    const guest = createCapturingSocket();
    const room = new GameRoom('room-viewer-safe');
    room.players = [
        { playerId: 'host', name: 'Host', ws: host.ws },
        { playerId: 'guest', name: 'Guest', ws: guest.ws }
    ];
    room.gameState = {
        gameId: 'room-viewer-safe',
        players: [makePlayer('host'), makePlayer('guest')],
        geishas: [],
        drawPile: [{ id: 'draw', geishaId: 1, type: 'item' }],
        discardPile: [],
        currentPlayer: 0,
        phase: 'playing',
        round: 1,
        winner: null,
        orderDecision: {
            isOpen: false,
            phase: 'result',
            players: ['host', 'guest'],
            confirmations: ['host', 'guest'],
            waitingFor: [],
            currentPlayer: 'host'
        },
        pendingInteraction: null,
        lastAction: undefined
    };
    let persisted = 0;
    room.persistRoomSnapshot = () => {
        persisted += 1;
    };

    const visibleToHost = room.buildClientGameState('host');
    assert.deepEqual(visibleToHost?.drawPile, []);
    assert.equal(visibleToHost?.players[1]?.hand[0]?.type, 'hidden');
    assert.deepEqual(visibleToHost?.players[1]?.secretCards, []);

    room.broadcastGameState();

    assert.equal(persisted, 1);
    assert.equal(host.messages[0]?.type, 'GAME_STATE_UPDATED');
    assert.equal(guest.messages[0]?.type, 'GAME_STATE_UPDATED');
    const hostPayload = host.messages[0]?.payload as NonNullable<typeof room.gameState>;
    const guestPayload = guest.messages[0]?.payload as NonNullable<typeof room.gameState>;
    assert.equal(hostPayload.players[1]?.hand[0]?.type, 'hidden');
    assert.equal(guestPayload.players[0]?.hand[0]?.type, 'hidden');
    assert.deepEqual(hostPayload.players[1]?.secretCards, []);
    assert.deepEqual(guestPayload.players[0]?.secretCards, []);
});

test('GameRoom facade sends direct messages without broadcasting to other seats', () => {
    const host = createCapturingSocket();
    const guest = createCapturingSocket();
    const room = new GameRoom('room-direct-message');
    room.players = [
        { playerId: 'host', name: 'Host', ws: host.ws },
        { playerId: 'guest', name: 'Guest', ws: guest.ws }
    ];

    room.sendToPlayer('host', {
        type: 'READY_CHECK',
        payload: {
            confirmations: [],
            waitingFor: ['host', 'guest']
        }
    });

    assert.deepEqual(host.messages, [{
        type: 'READY_CHECK',
        payload: {
            confirmations: [],
            waitingFor: ['host', 'guest']
        }
    }]);
    assert.deepEqual(guest.messages, []);
});

test('GameRoom facade resumes restored resolution runtime through next-round scheduling', () => {
    const room = new GameRoom('room-resume-facade');
    room.gameState = { phase: 'resolution' } as NonNullable<typeof room.gameState>;
    let scheduled = 0;
    room.scheduleNextRound = () => {
        scheduled += 1;
    };

    room.resumeRestoredRuntime();

    assert.equal(scheduled, 1);
});

test('GameRoom starts game before sending masked deal animation cards', () => {
    const host = createCapturingSocket();
    const guest = createCapturingSocket();
    const room = new GameRoom('room-start');
    room.hostId = 'host';
    room.players = [
        { playerId: 'host', name: 'Host', ws: host.ws },
        { playerId: 'guest', name: 'Guest', ws: guest.ws }
    ];
    assert.equal(room.regenerateBaseGeishas(), true);
    assert.equal(room.prepareOrderDecisionState(), true);
    room.orderDecisionState.result = {
        firstPlayer: 'host',
        secondPlayer: 'guest',
        order: ['host', 'guest']
    };
    room.orderDecisionState.confirmations = new Set(['host', 'guest']);
    room.readyConfirmations = new Set(['host', 'guest']);

    room.startGameWithOrder();

    const startedIndex = host.messages.findIndex(message => message.type === 'GAME_STARTED');
    const animationIndex = host.messages.findIndex(message => message.type === 'DEAL_ANIMATION');
    assert.ok(startedIndex >= 0);
    assert.ok(animationIndex > startedIndex);

    const animation = host.messages[animationIndex]?.payload as {
        sequence?: Array<{ card?: { id?: string; type?: string } }>;
    };
    assert.equal(animation.sequence?.length, 12);
    assert.equal(animation.sequence?.every(step => (
        step.card?.type === 'hidden'
        && step.card.id?.startsWith('hidden-host-deal-')
    )), true);

    const hostDraw = host.messages.find(message => message.type === 'CARD_DRAWN')?.payload as {
        playerId?: string;
        card?: { id?: string; type?: string };
    };
    const guestDraw = guest.messages.find(message => message.type === 'CARD_DRAWN')?.payload as {
        playerId?: string;
        card?: { id?: string; type?: string };
    };
    assert.equal(hostDraw.playerId, 'host');
    assert.notEqual(hostDraw.card?.type, 'hidden');
    assert.equal(guestDraw.playerId, 'host');
    assert.equal(guestDraw.card?.type, 'hidden');
    assert.equal(guestDraw.card?.id, 'hidden-draw-host-0');
});

test('GameRoom preserves rematch and ready check payloads', () => {
    const host = createCapturingSocket();
    const guest = createCapturingSocket();
    const room = new GameRoom('room-confirmations');
    room.players = [
        { playerId: 'host', ws: host.ws },
        { playerId: 'guest', ws: guest.ws }
    ];
    room.gameState = { phase: 'deciding_order' } as NonNullable<typeof room.gameState>;

    room.requestRematch('host');
    room.startReadyCheck();

    assert.deepEqual(host.messages[0], {
        type: 'REMATCH_REQUESTED',
        payload: { confirmations: ['host'] }
    });
    assert.deepEqual(host.messages[1], {
        type: 'READY_CHECK',
        payload: {
            confirmations: [],
            waitingFor: ['host', 'guest']
        }
    });
});

test('GameRoom schedules order decision and ready check with existing delays', () => {
    const { scheduler, scheduled } = createFakeScheduler();
    const room = new GameRoom('room-scheduler', scheduler);
    room.players = [
        { playerId: 'host', ws: createDisconnectedSocket() },
        { playerId: 'guest', ws: createDisconnectedSocket() }
    ];
    assert.equal(room.regenerateBaseGeishas(), true);

    room.startOrderDecision();
    assert.equal(scheduled[0]?.delayMs, 2000);

    scheduled[0]?.callback();
    room.confirmOrder('host');
    room.confirmOrder('guest');
    assert.equal(scheduled[1]?.delayMs, 800);
});

test('GameRoom schedules npc turns with the existing delay and replaces stale timers', () => {
    const { scheduler, scheduled, cleared } = createFakeScheduler();
    const room = new GameRoom('room-npc-scheduler', scheduler);
    room.players = [{ playerId: 'host', ws: createDisconnectedSocket() }];
    const npcId = room.addNpcPlayer('hard');
    room.gameState = {
        phase: 'playing',
        currentPlayer: 1,
        pendingInteraction: null,
        players: [
            { id: 'host' },
            { id: npcId }
        ]
    } as NonNullable<typeof room.gameState>;

    room.scheduleNpcTurn();
    room.scheduleNpcTurn();

    assert.equal(scheduled[0]?.delayMs, 700);
    assert.equal(scheduled[1]?.delayMs, 700);
    assert.deepEqual(cleared, [1]);
});

test('GameRoom resumes restored order confirmation state and runtime timers', () => {
    const orderScheduler = createFakeScheduler();
    const orderRoom = new GameRoom('room-order-restore');
    orderRoom.players = [
        { playerId: 'host', sessionToken: 'host-token', ws: createDisconnectedSocket() },
        { playerId: 'guest', sessionToken: 'guest-token', ws: createDisconnectedSocket() }
    ];
    assert.equal(orderRoom.regenerateBaseGeishas(), true);
    assert.equal(orderRoom.prepareOrderDecisionState(), true);
    orderRoom.gameState!.orderDecision = {
        ...orderRoom.gameState!.orderDecision,
        phase: 'result',
        result: {
            firstPlayer: 'host',
            secondPlayer: 'guest',
            order: ['host', 'guest']
        },
        confirmations: ['host'],
        waitingFor: ['guest']
    };
    const restoredOrderRoom = restoreRoomFromSnapshot(orderRoom.buildRoomSnapshot(), {
        createRoom: roomId => new GameRoom(roomId, orderScheduler.scheduler)
    }).room;

    assert.equal(restoredOrderRoom?.orderDecisionState.result?.firstPlayer, 'host');
    assert.deepEqual(Array.from(restoredOrderRoom?.orderDecisionState.confirmations ?? []), ['host']);

    const npcScheduler = createFakeScheduler();
    const npcRoom = new GameRoom('room-npc-restore');
    npcRoom.players = [{ playerId: 'host', sessionToken: 'host-token', ws: createDisconnectedSocket() }];
    const npcId = npcRoom.addNpcPlayer('hard');
    assert.equal(npcRoom.regenerateBaseGeishas(), true);
    npcRoom.gameState = {
        phase: 'playing',
        currentPlayer: 1,
        pendingInteraction: null,
        players: [{ id: 'host' }, { id: npcId }]
    } as NonNullable<typeof npcRoom.gameState>;
    restoreRoomFromSnapshot(npcRoom.buildRoomSnapshot(), {
        createRoom: roomId => new GameRoom(roomId, npcScheduler.scheduler)
    });

    assert.equal(npcScheduler.scheduled[0]?.delayMs, 700);

    const resolutionScheduler = createFakeScheduler();
    const resolutionRoom = new GameRoom('room-resolution-restore');
    resolutionRoom.players = [
        { playerId: 'host', sessionToken: 'host-token', ws: createDisconnectedSocket() },
        { playerId: 'guest', sessionToken: 'guest-token', ws: createDisconnectedSocket() }
    ];
    assert.equal(resolutionRoom.regenerateBaseGeishas(), true);
    resolutionRoom.gameState = { phase: 'resolution' } as NonNullable<typeof resolutionRoom.gameState>;
    restoreRoomFromSnapshot(resolutionRoom.buildRoomSnapshot(), {
        createRoom: roomId => new GameRoom(roomId, resolutionScheduler.scheduler)
    });

    assert.equal(resolutionScheduler.scheduled[0]?.delayMs, 2500);
});
