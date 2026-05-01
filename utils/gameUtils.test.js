import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDeckForGeishas,
    cloneGeishasForNextRound,
    createDeterministicRandomSource,
    createRandomizedGeishas,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    validateGinzaSetupData
} from './gameUtils.js';

const serializeBoard = (geishas) => geishas.map((geisha) => ({
    id: geisha.id,
    characterId: geisha.characterId,
    boardSlotId: geisha.boardSlotId,
    charmPoints: geisha.charmPoints
}));

test('default Ginza setup is reproducible with the same deterministic random source', () => {
    const seed = [4, 1, 6, 0, 3, 2, 5, 9, 8, 7];
    const boardA = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource(seed)
    });
    const boardB = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource(seed)
    });

    assert.deepEqual(serializeBoard(boardA), serializeBoard(boardB));
    assert.equal(boardA.length, 7);
    assert.deepEqual(boardA.map((geisha) => geisha.charmPoints), [2, 2, 2, 3, 3, 4, 5]);
    assert.equal(new Set(boardA.map((geisha) => geisha.characterId)).size, 7);
    assert.equal(new Set(boardA.map((geisha) => geisha.boardSlotId)).size, 7);
});

test('Ginza deck generation keeps rule identity and adds display-only item payloads', () => {
    const geishas = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    const { deck, removedCard } = buildDeckForGeishas(geishas, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const allCards = removedCard ? [...deck, removedCard] : deck;

    assert.equal(allCards.length, 21);

    geishas.forEach((geisha) => {
        const matchingCards = allCards.filter((card) => card.geishaId === geisha.id);
        assert.equal(matchingCards.length, geisha.charmPoints);
        matchingCards.forEach((card) => {
            assert.equal(card.boardSlotId, geisha.boardSlotId);
            assert.ok(card.itemAssetName);
            assert.ok(card.itemLabel);
            assert.ok(card.itemImageUrl);
            assert.ok(card.itemIconUrl);
        });
    });
});

test('invalid Ginza setup data fails fast', () => {
    assert.throws(
        () => validateGinzaSetupData(ginzaCharacterPool.slice(0, 6), ginzaBoardSlotDefinitions),
        /at least seven characters/
    );

    const invalidSlots = ginzaBoardSlotDefinitions.map((slot, index) => (
        index === 0 ? { ...slot, itemIconUrl: '' } : slot
    ));

    assert.throws(
        () => validateGinzaSetupData(ginzaCharacterPool, invalidSlots),
        /must include slotId, slotOrder, charmPoints/
    );
});

test('next-round clone preserves the same selected board identity and control state', () => {
    const board = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([3, 1, 4, 1, 5, 9, 2])
    });
    board[0].controlledBy = 'player1';
    board[4].controlledBy = 'player2';

    const nextRoundBoard = cloneGeishasForNextRound(board);

    assert.deepEqual(serializeBoard(nextRoundBoard), serializeBoard(board));
    assert.equal(nextRoundBoard[0].controlledBy, 'player1');
    assert.equal(nextRoundBoard[4].controlledBy, 'player2');
    assert.notEqual(nextRoundBoard[0], board[0]);
});

test('rematch setup can reshuffle the seven-character board with a different deterministic source', () => {
    const boardA = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createRandomizedGeishas('default', {
        randomSource: createDeterministicRandomSource([6, 5, 4, 3, 2, 1, 0])
    });

    assert.notDeepEqual(
        boardA.map((geisha) => geisha.characterId),
        boardB.map((geisha) => geisha.characterId)
    );
});
