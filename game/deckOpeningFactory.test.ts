import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha, ItemCard, OpeningDealSummary } from '@newhandarky/hanakoji-game-types';
import { ginzaBoardSlotDefinitions } from './geishaSetRules.js';
import { createDeterministicRandomSource } from './gameRandomSource.js';
import { createRandomizedGeishas } from './geishaBoardFactory.js';
import {
    buildDeckForGeishas,
    buildOpeningDealSummary,
    markOpeningDealNotReplayable
} from './deckOpeningFactory.js';

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

test('deck factory creates deterministic decks and one removed card', () => {
    const boardA = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });

    const deckA = buildDeckForGeishas(boardA, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const deckB = buildDeckForGeishas(boardB, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });

    assert.deepEqual(deckA, deckB);
    assert.equal(deckA.deck.length + (deckA.removedCard ? 1 : 0), 21);
});

test('deck factory remains bound to Ginza board slots and rejects legacy board data', () => {
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

    const legacyLikeGeishas = [{
        id: 1,
        name: 'legacy',
        imageUrl: '',
        charmPoints: 2,
        controlledBy: null
    }] as Geisha[];

    assert.throws(
        () => buildDeckForGeishas(legacyLikeGeishas),
        /Missing boardSlotId/
    );
});

test('opening deal summary hides card identity and not replayable clone preserves steps', () => {
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
    assert.notEqual(notReplayable.steps, summary.steps);
});
