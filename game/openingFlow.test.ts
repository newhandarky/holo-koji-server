import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import {
    applyOrderConfirmation,
    applyOrderDecisionResult,
    buildConfirmationUpdate,
    buildOrderDecisionGameState,
    canStartGameWithOrder,
    choosePlayerOrder,
    createOrderDecisionState
} from './openingFlow.js';

const makeGeishas = (): Geisha[] => [2, 2, 2, 3, 3, 4, 5].map((charmPoints, index) => ({
    id: index + 1,
    characterId: `character-${index + 1}`,
    boardSlotId: index + 1,
    name: `Geisha ${index + 1}`,
    imageUrl: `https://example.test/geisha-${index + 1}.png`,
    charmPoints,
    controlledBy: null
}));

test('buildOrderDecisionGameState creates deciding state without mutating board input', () => {
    const baseGeishas = makeGeishas();
    const snapshot = structuredClone(baseGeishas);
    const result = buildOrderDecisionGameState({
        roomId: 'room-a',
        hostId: 'player-a',
        playerIds: ['player-a', 'player-b'],
        baseGeishas,
        geishaSet: 'default'
    });

    assert.equal(result.ok, true);
    assert.deepEqual(baseGeishas, snapshot);
    if (!result.ok) return;
    assert.equal(result.value.phase, 'deciding_order');
    assert.deepEqual(result.value.orderDecision.waitingFor, ['player-a', 'player-b']);
    assert.notEqual(result.value.geishas[0], baseGeishas[0]);
});

test('buildOrderDecisionGameState rejects incomplete rooms', () => {
    assert.deepEqual(buildOrderDecisionGameState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a'],
        baseGeishas: makeGeishas(),
        geishaSet: 'default'
    }), {
        ok: false,
        errorMessage: '玩家不足，無法準備順序決定'
    });
});

test('choosePlayerOrder uses injected random value for deterministic ordering', () => {
    assert.deepEqual(choosePlayerOrder(['player-a', 'player-b'], 0.1), {
        firstPlayer: 'player-a',
        secondPlayer: 'player-b',
        order: ['player-a', 'player-b']
    });
    assert.deepEqual(choosePlayerOrder(['player-a', 'player-b'], 0.9), {
        firstPlayer: 'player-b',
        secondPlayer: 'player-a',
        order: ['player-b', 'player-a']
    });
    assert.equal(choosePlayerOrder(['player-a'], 0.1), null);
});

test('applyOrderDecisionResult reorders players without mutating input', () => {
    const state = buildOrderDecisionGameState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a', 'player-b'],
        baseGeishas: makeGeishas(),
        geishaSet: 'default'
    });
    assert.equal(state.ok, true);
    if (!state.ok) return;
    const snapshot = structuredClone(state.value);
    const result = choosePlayerOrder(['player-a', 'player-b'], 0.9);
    assert.ok(result);
    if (!result) return;

    const updated = applyOrderDecisionResult(state.value, result);

    assert.deepEqual(state.value, snapshot);
    assert.deepEqual(updated.players.map(player => player.id), ['player-b', 'player-a']);
    assert.deepEqual(updated.orderDecision.waitingFor, ['player-b', 'player-a']);
});

test('confirmation update remains idempotent and updates waiting list', () => {
    assert.deepEqual(buildConfirmationUpdate(['player-a', 'player-b'], [], 'player-a'), {
        added: true,
        confirmations: ['player-a'],
        waitingFor: ['player-b']
    });
    assert.deepEqual(buildConfirmationUpdate(['player-a', 'player-b'], ['player-a'], 'player-a'), {
        added: false,
        confirmations: ['player-a'],
        waitingFor: ['player-b']
    });
});

test('applyOrderConfirmation updates state immutably', () => {
    const state = buildOrderDecisionGameState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a', 'player-b'],
        baseGeishas: makeGeishas(),
        geishaSet: 'default'
    });
    assert.equal(state.ok, true);
    if (!state.ok) return;
    const snapshot = structuredClone(state.value);
    const update = buildConfirmationUpdate(['player-a', 'player-b'], [], 'player-a');

    const updated = applyOrderConfirmation(state.value, update);

    assert.deepEqual(state.value, snapshot);
    assert.deepEqual(updated.orderDecision.confirmations, ['player-a']);
    assert.deepEqual(updated.orderDecision.waitingFor, ['player-b']);
});

test('canStartGameWithOrder requires result, order confirmations and ready confirmations', () => {
    const playerIds = ['player-a', 'player-b'];
    const result = choosePlayerOrder(playerIds, 0.1);

    assert.equal(canStartGameWithOrder(playerIds, result, playerIds, playerIds), true);
    assert.equal(canStartGameWithOrder(playerIds, null, playerIds, playerIds), false);
    assert.equal(canStartGameWithOrder(playerIds, result, ['player-a'], playerIds), false);
    assert.equal(canStartGameWithOrder(playerIds, result, playerIds, ['player-a']), false);
});

test('createOrderDecisionState returns fresh mutable confirmation sets', () => {
    const first = createOrderDecisionState();
    const second = createOrderDecisionState();

    first.confirmations.add('player-a');

    assert.deepEqual(Array.from(second.confirmations), []);
});
