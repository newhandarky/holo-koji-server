import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerGameState } from '../utils/gameUtils.js';
import {
    buildNpcResponseAction,
    buildNpcSeat,
    buildNpcTurnAction,
    canScheduleNpcResponse,
    canScheduleNpcTurn
} from './roomNpcRuntime.js';

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
