import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDeckForGeishas,
    cloneGeishasForNextRound,
    collaborationCharacterPool,
    createDeterministicRandomSource,
    createRandomizedGeishas,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    hololiveCharacterPool,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    resolveRestorableGeishaSet,
    validateCharacterSetData,
    validateGinzaSetupData,
    validateMatchBoardForSet
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

test('legacy geisha set key is rejected', () => {
    assert.equal(isSupportedGeishaSet('akatsuki'), false);
    assert.throws(
        () => createRandomizedGeishas('akatsuki'),
        /Unsupported geisha set/
    );
});

test('missing room creation set defaults to Ginza without erasing explicit supported sets', () => {
    assert.equal(normalizeGeishaSet(undefined), 'default');
    assert.equal(normalizeGeishaSet(null), 'default');
    assert.equal(normalizeGeishaSet('collaboration'), 'collaboration');
    assert.equal(normalizeGeishaSet('hololive'), 'hololive');
    assert.equal(isSupportedGeishaSet(''), false);
    assert.throws(
        () => createRandomizedGeishas(''),
        /Unsupported geisha set/
    );

    const defaultBoard = createRandomizedGeishas(undefined, {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    assert.equal(defaultBoard.every((geisha) => geisha.characterId.startsWith('ginza-')), true);
});

test('supported character sets create seven-character boards with fixed board-slot charms', () => {
    const setKeys = ['default', 'collaboration', 'hololive'];

    setKeys.forEach((setKey) => {
        const board = createRandomizedGeishas(setKey, {
            randomSource: createDeterministicRandomSource([4, 1, 6, 0, 3, 2, 5])
        });

        assert.equal(isSupportedGeishaSet(setKey), true);
        assert.equal(board.length, 7);
        assert.deepEqual(board.map((geisha) => geisha.charmPoints), [2, 2, 2, 3, 3, 4, 5]);
        assert.deepEqual(board.map((geisha) => geisha.boardSlotId), [1, 2, 3, 4, 5, 6, 7]);
        assert.equal(new Set(board.map((geisha) => geisha.characterId)).size, 7);
        board.forEach((geisha) => {
            assert.ok(geisha.characterId.startsWith(`${setKey === 'default' ? 'ginza' : setKey}-`));
            assert.ok(geisha.imageUrl.startsWith('https://'));
        });
    });
});

test('collaboration character data normalizes Marin and rejects unavailable pools', () => {
    assert.equal(collaborationCharacterPool.some((character) => character.name === 'マリン'), true);
    assert.equal(collaborationCharacterPool.some((character) => character.name === '、マリン'), false);

    assert.throws(
        () => validateCharacterSetData('collaboration', collaborationCharacterPool.slice(0, 6)),
        /at least seven characters/
    );

    assert.throws(
        () => createRandomizedGeishas('collaboration', {
            characterPool: collaborationCharacterPool.slice(0, 6)
        }),
        /at least seven characters/
    );
});

test('Hololive character data validates as an available set', () => {
    assert.doesNotThrow(() => validateCharacterSetData('hololive', hololiveCharacterPool));
});

test('room snapshot set resolution preserves supported sets and rejects unknown sets', () => {
    assert.equal(resolveRestorableGeishaSet({ geishaSet: 'collaboration' }), 'collaboration');
    assert.equal(resolveRestorableGeishaSet({ gameState: { geishaSet: 'hololive' } }), 'hololive');
    assert.equal(resolveRestorableGeishaSet({}), 'default');
    assert.equal(resolveRestorableGeishaSet({ geishaSet: null, gameState: { geishaSet: 'hololive' } }), 'hololive');

    assert.throws(
        () => resolveRestorableGeishaSet({ geishaSet: 'akatsuki' }),
        /Unsupported geisha set in room snapshot/
    );
});

test('restored match boards must belong to the selected character set', () => {
    const hololiveBoard = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    assert.doesNotThrow(() => validateMatchBoardForSet('hololive', hololiveBoard));

    const mismatchedBoard = createRandomizedGeishas('collaboration', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    assert.throws(
        () => validateMatchBoardForSet('hololive', mismatchedBoard),
        /outside the selected set/
    );

    const invalidSlotBoard = hololiveBoard.map((geisha, index) => (
        index === 0 ? { ...geisha, boardSlotId: 99 } : geisha
    ));
    assert.throws(
        () => validateMatchBoardForSet('hololive', invalidSlotBoard),
        /unknown board slot/
    );
});

test('deck generation remains bound to board slots for non-default sets', () => {
    const geishas = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });
    const { deck, removedCard } = buildDeckForGeishas(geishas, {
        randomSource: createDeterministicRandomSource([7, 6, 5, 4, 3, 2, 1])
    });
    const allCards = removedCard ? [...deck, removedCard] : deck;

    assert.equal(allCards.length, 21);
    geishas.forEach((geisha) => {
        const boardSlot = ginzaBoardSlotDefinitions.find((slot) => slot.slotId === geisha.boardSlotId);
        const matchingCards = allCards.filter((card) => card.geishaId === geisha.id);
        assert.equal(matchingCards.length, geisha.charmPoints);
        matchingCards.forEach((card) => {
            assert.equal(card.itemAssetName, boardSlot.itemAssetName);
            assert.equal(card.itemIconUrl, boardSlot.itemIconUrl);
        });
    });
});

test('deck generation rejects geishas without board slot binding', () => {
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

test('next-round clone preserves the same selected board identity and control state', () => {
    const board = createRandomizedGeishas('collaboration', {
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
    const boardA = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([6, 5, 4, 3, 2, 1, 0])
    });

    assert.notDeepEqual(
        boardA.map((geisha) => geisha.characterId),
        boardB.map((geisha) => geisha.characterId)
    );
});
