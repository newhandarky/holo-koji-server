import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha, ItemCard, OpeningDealSummary } from '@newhandarky/hanakoji-game-types';
import { ginzaBoardSlotDefinitions, hololiveCharacterPool } from './geishaSetRules.js';
import {
    buildDeckForGeishas,
    buildOpeningDealSummary,
    cloneGeishasForNextRound,
    createCustomSelectedGeishas,
    createDeterministicRandomSource,
    createGameStateWithOrder,
    createRandomizedGeishas,
    createWaitingGameState,
    markOpeningDealNotReplayable
} from './gameStateFactory.js';

const serializeBoard = (geishas: Geisha[]) => geishas.map((geisha) => ({
    characterId: geisha.characterId,
    boardSlotId: geisha.boardSlotId,
    charmPoints: geisha.charmPoints,
    controlledBy: geisha.controlledBy
}));

const forbiddenOpeningDealFields = [
    'card',
    'cardId',
    'geishaId',
    'boardSlotId',
    'itemAssetName',
    'itemLabel',
    'itemImageUrl',
    'itemIconUrl',
    'charmPoints'
];

const makeOpeningDealSequence = (playerIds = ['player1', 'player2']) => {
    const geishas = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    const { deck } = buildDeckForGeishas(geishas, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const dealingDeck = [...deck];
    const sequence: Array<{ order: number; playerId: string; card: ItemCard }> = [];

    for (let round = 0; round < 6; round += 1) {
        playerIds.forEach((playerId) => {
            sequence.push({
                order: sequence.length,
                playerId,
                card: dealingDeck.shift() as ItemCard
            });
        });
    }

    return sequence;
};

const assertNoOpeningDealCardIdentity = (summary: OpeningDealSummary) => {
    const encoded = JSON.stringify(summary);
    forbiddenOpeningDealFields.forEach((field) => {
        assert.equal(Object.prototype.hasOwnProperty.call(summary, field), false);
        assert.equal(encoded.includes(`"${field}"`), false);
    });
};

test('factory creates reproducible randomized boards and decks from deterministic sources', () => {
    const boardA = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });

    assert.deepEqual(serializeBoard(boardA), serializeBoard(boardB));
    assert.equal(boardA.length, 7);
    assert.deepEqual(boardA.map((geisha) => geisha.boardSlotId), [1, 2, 3, 4, 5, 6, 7]);

    const deckA = buildDeckForGeishas(boardA, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const deckB = buildDeckForGeishas(boardB, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });

    assert.deepEqual(deckA, deckB);
    assert.equal(deckA.deck.length + (deckA.removedCard ? 1 : 0), 21);
});

test('waiting state uses provided board and player metadata without mutating inputs', () => {
    const board = createRandomizedGeishas('collaboration', {
        randomSource: createDeterministicRandomSource([3, 1, 4, 1, 5, 9, 2])
    });
    const waitingState = createWaitingGameState(
        'room-waiting',
        ['host', 'joiner'],
        board,
        'collaboration',
        {
            host: { name: 'Host', lineUserId: 'line-host' },
            joiner: { name: 'Joiner', avatarUrl: 'https://example.test/joiner.png' }
        }
    );

    assert.equal(waitingState.phase, 'waiting');
    assert.equal(waitingState.geishaSet, 'collaboration');
    assert.deepEqual(waitingState.players.map((player) => player.name), ['Host', 'Joiner']);
    assert.deepEqual(serializeBoard(waitingState.geishas), serializeBoard(board));
    assert.notEqual(waitingState.geishas[0], board[0]);
});

test('ordered state preserves existing players, round, opening deal, and board identity', () => {
    const baseBoard = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([2, 4, 6, 1, 3, 5, 0])
    });
    const existingState = createWaitingGameState(
        'room-ordered',
        ['player1', 'player2'],
        baseBoard,
        'hololive'
    );
    existingState.round = 3;
    existingState.players[0].actionTokens[0].used = true;
    existingState.openingDeal = buildOpeningDealSummary(makeOpeningDealSequence(['player1', 'player2']), {
        sequenceId: 'opening-preserved'
    });

    const { gameState } = createGameStateWithOrder(
        'room-ordered',
        ['player2', 'player1'],
        baseBoard,
        existingState
    );

    assert.equal(gameState.phase, 'playing');
    assert.equal(gameState.round, 3);
    assert.equal(gameState.orderDecision.result?.firstPlayer, 'player2');
    assert.equal(gameState.players[1].actionTokens[0].used, true);
    assert.equal(gameState.openingDeal?.sequenceId, 'opening-preserved');
    assert.deepEqual(serializeBoard(gameState.geishas), serializeBoard(baseBoard));
    assert.notEqual(gameState.geishas[0], baseBoard[0]);
});

test('custom selected board keeps selected identities while allowing deterministic slot reassignment', () => {
    const selectedIds = hololiveCharacterPool.map((character) => character.characterId);
    const boardA = createCustomSelectedGeishas('hololive', { characterIds: selectedIds }, {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createCustomSelectedGeishas('hololive', { characterIds: selectedIds }, {
        randomSource: createDeterministicRandomSource([6, 5, 4, 3, 2, 1, 0])
    });

    assert.deepEqual(new Set(boardA.map((geisha) => geisha.characterId)), new Set(selectedIds));
    assert.deepEqual(new Set(boardB.map((geisha) => geisha.characterId)), new Set(selectedIds));
    assert.notDeepEqual(serializeBoard(boardA), serializeBoard(boardB));
});

test('deck generation rejects legacy boards without board slot bindings', () => {
    const legacyLikeGeishas = [{
        id: 1,
        name: 'legacy',
        imageUrl: '',
        charmPoints: 2,
        controlledBy: null
    }];

    assert.throws(
        () => buildDeckForGeishas(legacyLikeGeishas),
        /Missing boardSlotId/
    );
});

test('deck generation remains bound to Ginza board slots for non-default sets', () => {
    const geishas = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    const { deck, removedCard } = buildDeckForGeishas(geishas, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const allCards = removedCard ? [...deck, removedCard] : deck;

    geishas.forEach((geisha) => {
        const boardSlot = ginzaBoardSlotDefinitions.find((slot) => slot.slotId === geisha.boardSlotId);
        assert.ok(boardSlot);
        const matchingCards = allCards.filter((card) => card.geishaId === geisha.id);
        assert.equal(matchingCards.length, geisha.charmPoints);
        matchingCards.forEach((card) => {
            assert.equal(card.itemAssetName, boardSlot.itemAssetName);
            assert.equal(card.itemIconUrl, boardSlot.itemIconUrl);
        });
    });
});

test('opening deal summary hides card identity and can be marked not replayable', () => {
    const summary = buildOpeningDealSummary(makeOpeningDealSequence(['first', 'second']), {
        sequenceId: 'opening-room-1-round-1'
    });

    assert.equal(summary.sequenceId, 'opening-room-1-round-1');
    assert.equal(summary.status, 'completed');
    assert.equal(summary.completed, true);
    assert.equal(summary.steps.length, 14);
    assert.deepEqual(summary.steps[0], {
        type: 'BURN_HIDDEN_CARD',
        order: 0,
        targetZone: 'hidden-reserve'
    });
    assertNoOpeningDealCardIdentity(summary);

    const notReplayable = markOpeningDealNotReplayable(summary);
    assert.ok(notReplayable);
    assert.equal(notReplayable.status, 'not_replayable');
    assert.equal(notReplayable.replayable, false);
    assert.equal(notReplayable.completed, true);
    assert.deepEqual(notReplayable.steps, summary.steps);
});

test('next-round clone preserves board identity and control state without sharing objects', () => {
    const board = createRandomizedGeishas('collaboration', {
        randomSource: createDeterministicRandomSource([3, 1, 4, 1, 5, 9, 2])
    });
    board[0].controlledBy = 'player1';

    const nextRoundBoard = cloneGeishasForNextRound(board);

    assert.deepEqual(serializeBoard(nextRoundBoard), serializeBoard(board));
    assert.notEqual(nextRoundBoard[0], board[0]);
});
