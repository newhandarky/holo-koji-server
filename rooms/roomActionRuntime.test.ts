import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    ActionType,
    ItemCard,
    PendingInteraction
} from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import {
    handleRoomAction,
    type RoomActionRuntime
} from './roomActionRuntime.js';
import type { ServerAction } from '../game/actionValidation.js';
import type { WireMessage } from './roomMessaging.js';

type RecordedCall = {
    name: string;
    args?: unknown[];
};

const makeCard = (id: string, geishaId = 1): ItemCard => ({
    id,
    geishaId,
    type: 'item'
});

const makePlayer = (
    id: string,
    cardIds: string[] = ['card-1', 'card-2', 'card-3', 'card-4'],
    actionOverrides: Partial<Record<ActionType, boolean>> = {}
): ServerGameState['players'][number] => ({
    id,
    name: id,
    hand: cardIds.map((cardId, index) => makeCard(cardId, index + 1)),
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as ActionType[]).map((type) => ({
        type,
        used: actionOverrides[type] ?? false
    })),
    score: { charm: 0, tokens: 0 }
} as ServerGameState['players'][number]);

const makeState = (
    overrides: Partial<ServerGameState> = {}
): ServerGameState => ({
    players: [makePlayer('host'), makePlayer('guest', [])],
    currentPlayer: 0,
    phase: 'playing',
    pendingInteraction: null,
    geishas: [],
    orderDecision: {
        isOpen: false,
        phase: 'idle',
        players: [],
        confirmations: [],
        waitingFor: []
    },
    ...overrides
} as unknown as ServerGameState);

const createRoom = (overrides: Partial<RoomActionRuntime> = {}) => {
    const calls: RecordedCall[] = [];
    const state = overrides.gameState === undefined ? makeState() : overrides.gameState;
    const room: RoomActionRuntime = {
        roomId: 'room-action-runtime',
        gameState: state,
        players: [{ playerId: 'host' }, { playerId: 'guest' }],
        sendToPlayer: (playerId: string, message: WireMessage) => {
            calls.push({ name: 'sendToPlayer', args: [playerId, message] });
        },
        sendError: (playerId: string, message: string, code?: string) => {
            calls.push({ name: 'sendError', args: [playerId, message, code] });
        },
        getPlayerState: (playerId: string) => room.gameState?.players.find(player => player.id === playerId) ?? null,
        getOpponentId: (playerId: string) => room.players.find(player => player.playerId !== playerId)?.playerId ?? null,
        sendPendingInteractionState: () => {
            calls.push({ name: 'sendPendingInteractionState' });
        },
        broadcast: (message: WireMessage) => {
            calls.push({ name: 'broadcast', args: [message] });
        },
        broadcastGameState: () => {
            calls.push({ name: 'broadcastGameState' });
        },
        endTurn: () => {
            calls.push({ name: 'endTurn' });
        },
        isNpcPlayerId: (playerId: string) => playerId === 'guest-npc',
        scheduleNpcResponse: () => {
            calls.push({ name: 'scheduleNpcResponse' });
        },
        ...overrides
    };

    return { room, calls };
};

test('handleRoomAction preserves missing game state error dispatch', () => {
    const { room, calls } = createRoom({ gameState: null });

    handleRoomAction(room, 'host', { type: 'PLAY_SECRET' } as ServerAction);

    assert.deepEqual(calls, [
        { name: 'sendError', args: ['host', '遊戲尚未準備完成', undefined] }
    ]);
});

test('handleRoomAction preserves invalid phase and pending interaction errors', () => {
    const waiting = createRoom({
        gameState: makeState({ phase: 'waiting' } as Partial<ServerGameState>)
    });

    handleRoomAction(waiting.room, 'host', { type: 'PLAY_SECRET', payload: { cardId: 'card-1' } });

    assert.deepEqual(waiting.calls, [
        { name: 'sendError', args: ['host', '目前無法執行行動', undefined] }
    ]);

    const pendingInteraction: PendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'guest',
        targetPlayerId: 'host',
        offeredCards: [makeCard('gift-1')]
    };
    const pending = createRoom({
        gameState: makeState({ pendingInteraction } as Partial<ServerGameState>)
    });

    handleRoomAction(pending.room, 'host', {
        type: 'INITIATE_GIFT',
        payload: { cardIds: ['card-1', 'card-2', 'card-3'] }
    });

    assert.deepEqual(pending.calls, [
        { name: 'sendError', args: ['host', '目前正在等待對手回應', undefined] }
    ]);
});

test('secret and trade-off actions preserve action result event order and lastAction', () => {
    const secret = createRoom();

    handleRoomAction(secret.room, 'host', {
        type: 'PLAY_SECRET',
        payload: { cardId: 'card-1' }
    });

    assert.equal(secret.room.gameState?.lastAction?.action, 'secret');
    assert.equal(secret.room.gameState?.players[0]?.secretCards[0]?.id, 'card-1');
    assert.deepEqual(secret.calls.map(call => call.name), [
        'sendToPlayer',
        'sendToPlayer',
        'broadcastGameState',
        'endTurn'
    ]);

    const tradeOff = createRoom();

    handleRoomAction(tradeOff.room, 'host', {
        type: 'PLAY_TRADE_OFF',
        payload: { cardIds: ['card-1', 'card-2'] }
    });

    assert.equal(tradeOff.room.gameState?.lastAction?.action, 'trade-off');
    assert.deepEqual(
        tradeOff.room.gameState?.players[0]?.discardedCards.map(card => card.id),
        ['card-1', 'card-2']
    );
    assert.deepEqual(tradeOff.calls.map(call => call.name), [
        'sendToPlayer',
        'sendToPlayer',
        'broadcastGameState',
        'endTurn'
    ]);
});

test('gift and competition initiation preserve pending broadcast order and npc response scheduling', () => {
    const gift = createRoom({
        players: [{ playerId: 'host' }, { playerId: 'guest-npc' }],
        getOpponentId: () => 'guest-npc'
    });

    handleRoomAction(gift.room, 'host', {
        type: 'INITIATE_GIFT',
        payload: { cardIds: ['card-1', 'card-2', 'card-3'] }
    });

    assert.equal(gift.room.gameState?.lastAction?.action, 'gift');
    assert.equal(gift.room.gameState?.pendingInteraction?.type, 'GIFT_SELECTION');
    assert.deepEqual(gift.calls.map(call => call.name), [
        'sendPendingInteractionState',
        'broadcastGameState',
        'scheduleNpcResponse'
    ]);

    const competition = createRoom({
        players: [{ playerId: 'host' }, { playerId: 'guest-npc' }],
        getOpponentId: () => 'guest-npc'
    });

    handleRoomAction(competition.room, 'host', {
        type: 'INITIATE_COMPETITION',
        payload: { groups: [['card-1', 'card-2'], ['card-3', 'card-4']] }
    });

    assert.equal(competition.room.gameState?.lastAction?.action, 'competition');
    assert.equal(competition.room.gameState?.pendingInteraction?.type, 'COMPETITION_SELECTION');
    assert.deepEqual(competition.calls.map(call => call.name), [
        'sendPendingInteractionState',
        'broadcastGameState',
        'scheduleNpcResponse'
    ]);
});

test('gift and competition resolution preserve resolved event order and clear pending state', () => {
    const giftPending: PendingInteraction = {
        type: 'GIFT_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        offeredCards: [makeCard('gift-1'), makeCard('gift-2'), makeCard('gift-3')]
    };
    const gift = createRoom({
        gameState: makeState({ pendingInteraction: giftPending } as Partial<ServerGameState>)
    });

    handleRoomAction(gift.room, 'guest', {
        type: 'RESOLVE_GIFT',
        payload: { chosenCardId: 'gift-1' }
    });

    assert.equal(gift.room.gameState?.pendingInteraction, null);
    assert.deepEqual(gift.calls.map(call => call.name), [
        'broadcast',
        'broadcastGameState',
        'endTurn'
    ]);

    const competitionPending: PendingInteraction = {
        type: 'COMPETITION_SELECTION',
        initiatorId: 'host',
        targetPlayerId: 'guest',
        groups: [[makeCard('comp-1'), makeCard('comp-2')], [makeCard('comp-3'), makeCard('comp-4')]]
    };
    const competition = createRoom({
        gameState: makeState({ pendingInteraction: competitionPending } as Partial<ServerGameState>)
    });

    handleRoomAction(competition.room, 'guest', {
        type: 'RESOLVE_COMPETITION',
        payload: { chosenGroupIndex: 1 }
    });

    assert.equal(competition.room.gameState?.pendingInteraction, null);
    assert.deepEqual(competition.calls.map(call => call.name), [
        'broadcast',
        'broadcastGameState',
        'endTurn'
    ]);
});
