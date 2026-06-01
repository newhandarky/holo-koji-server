import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import {
    buildPreparedRoundState,
    inspectRoundSetup
} from './roundPreparation.js';

const makeGeishas = (): Geisha[] => [2, 2, 2, 3, 3, 4, 5].map((charmPoints, index) => ({
    id: index + 1,
    characterId: `character-${index + 1}`,
    boardSlotId: index + 1,
    name: `Geisha ${index + 1}`,
    imageUrl: `https://example.test/geisha-${index + 1}.png`,
    charmPoints,
    controlledBy: null
}));

const makeRandomSource = () => {
    let token = 0;
    return {
        nextInt: (maxExclusive: number) => maxExclusive - 1,
        nextToken: () => `token-${token++}`
    };
};

test('buildPreparedRoundState deals six alternating cards per player and leaves eight cards to draw', () => {
    const result = buildPreparedRoundState({
        roomId: 'room-a',
        hostId: 'player-a',
        playerIds: ['player-a', 'player-b'],
        baseGeishas: makeGeishas(),
        roundNumber: 2,
        openOrderDecision: false,
        randomSource: makeRandomSource()
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.gameState.players.map(player => player.hand.length), [6, 6]);
    assert.equal(result.gameState.drawPile.length, 8);
    assert.ok(result.gameState.removedCard);
    assert.equal(result.dealSequence.length, 12);
    assert.deepEqual(
        result.dealSequence.map(step => step.playerId),
        Array.from({ length: 12 }, (_, index) => index % 2 === 0 ? 'player-a' : 'player-b')
    );
});

test('buildPreparedRoundState creates round metadata and opening deal summary', () => {
    const result = buildPreparedRoundState({
        roomId: 'room-a',
        hostId: 'player-a',
        playerIds: ['player-a', 'player-b'],
        baseGeishas: makeGeishas(),
        roundNumber: 3,
        openOrderDecision: false,
        randomSource: makeRandomSource()
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.gameState.phase, 'playing');
    assert.equal(result.gameState.round, 3);
    assert.equal(result.gameState.orderDecision.result?.firstPlayer, 'player-a');
    assert.equal(result.gameState.openingDeal?.sequenceId, 'opening-room-a-round-3');
    assert.equal(result.gameState.openingDeal?.steps.length, 14);
    assert.deepEqual(result.diagnostics, {
        totalPlayers: 2,
        handSizes: [6, 6],
        drawPileSize: 8,
        totalCardsInGame: 21,
        hasUnexpectedTotalCards: false,
        hasUnexpectedHandSizes: false,
        hasUnexpectedDrawPileSize: false,
        hasDuplicateCardIds: false
    });
});

test('buildPreparedRoundState does not mutate base geishas', () => {
    const baseGeishas = makeGeishas();
    const snapshot = structuredClone(baseGeishas);

    const result = buildPreparedRoundState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a', 'player-b'],
        baseGeishas,
        roundNumber: 1,
        randomSource: makeRandomSource()
    });

    assert.equal(result.ok, true);
    assert.deepEqual(baseGeishas, snapshot);
    if (!result.ok) return;
    assert.notEqual(result.gameState.geishas[0], baseGeishas[0]);
});

test('inspectRoundSetup reports duplicate card ids and malformed distribution', () => {
    const result = buildPreparedRoundState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a', 'player-b'],
        baseGeishas: makeGeishas(),
        roundNumber: 1,
        randomSource: makeRandomSource()
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const duplicatedCard = result.gameState.players[1]?.hand[0];
    assert.ok(duplicatedCard);
    if (!duplicatedCard) return;
    result.gameState.players[0]?.hand.push(duplicatedCard);

    const diagnostics = inspectRoundSetup(result.gameState);
    assert.equal(diagnostics.hasDuplicateCardIds, true);
    assert.equal(diagnostics.hasUnexpectedTotalCards, true);
    assert.equal(diagnostics.hasUnexpectedHandSizes, true);
});

test('buildPreparedRoundState rejects incomplete rooms', () => {
    assert.deepEqual(buildPreparedRoundState({
        roomId: 'room-a',
        hostId: null,
        playerIds: ['player-a'],
        baseGeishas: makeGeishas(),
        roundNumber: 1,
        randomSource: makeRandomSource()
    }), {
        ok: false,
        errorMessage: '玩家不足，無法準備回合'
    });
});
