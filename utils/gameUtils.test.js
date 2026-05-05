import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildDeckForGeishas,
    cloneGeishasForNextRound,
    collaborationCharacterPool,
    createGameStateWithOrder,
    createDeterministicRandomSource,
    createPlayer,
    createRandomizedGeishas,
    createWaitingGameState,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    hololiveCharacterPool,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    sanitizePendingInteractionForViewer,
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

const serializeBoardIdentity = (geishas) => geishas.map((geisha) => ({
    characterId: geisha.characterId,
    boardSlotId: geisha.boardSlotId
}));

const supportedProductionPools = {
    default: ginzaCharacterPool,
    collaboration: collaborationCharacterPool,
    hololive: hololiveCharacterPool
};

const oversizedCharacterPool = [
    ...ginzaCharacterPool,
    {
        characterId: 'ginza-extra-guest',
        name: 'Extra Guest',
        imageUrl: 'https://example.test/ginza-extra-guest.png'
    }
];

const duplicateCharacterPool = [
    ...ginzaCharacterPool.slice(0, 6),
    {
        ...ginzaCharacterPool[0],
        name: 'Duplicate Ema'
    }
];

const incompleteCharacterPool = [
    ...ginzaCharacterPool.slice(0, 6),
    {
        characterId: 'ginza-incomplete',
        name: 'Incomplete Guest',
        imageUrl: ''
    }
];

const assertSevenUniqueBoard = (board, characterPool) => {
    const validCharacterIds = new Set(characterPool.map((character) => character.characterId));

    assert.equal(board.length, 7);
    assert.equal(new Set(board.map((geisha) => geisha.characterId)).size, 7);
    assert.equal(new Set(board.map((geisha) => geisha.boardSlotId)).size, 7);
    board.forEach((geisha) => {
        assert.equal(validCharacterIds.has(geisha.characterId), true);
        assert.ok(geisha.name);
        assert.ok(geisha.imageUrl);
    });
};

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

test('supported production pools contain at least seven valid profiles', () => {
    Object.entries(supportedProductionPools).forEach(([setKey, characterPool]) => {
        assert.equal(characterPool.length >= 7, true);
        assert.doesNotThrow(() => validateCharacterSetData(setKey, characterPool));
    });
});

test('exactly-seven production pools use every profile while allowing different slot assignment', () => {
    Object.entries(supportedProductionPools).forEach(([setKey, characterPool]) => {
        const boardA = createRandomizedGeishas(setKey, {
            randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
        });
        const boardB = createRandomizedGeishas(setKey, {
            randomSource: createDeterministicRandomSource([6, 5, 4, 3, 2, 1, 0])
        });

        assertSevenUniqueBoard(boardA, characterPool);
        assertSevenUniqueBoard(boardB, characterPool);
        assert.deepEqual(
            new Set(boardA.map((geisha) => geisha.characterId)),
            new Set(characterPool.map((character) => character.characterId))
        );
        assert.deepEqual(
            new Set(boardB.map((geisha) => geisha.characterId)),
            new Set(characterPool.map((character) => character.characterId))
        );
        assert.notDeepEqual(serializeBoardIdentity(boardA), serializeBoardIdentity(boardB));
    });
});

test('oversized pools sample seven unique profiles from the whole pool', () => {
    const board = createRandomizedGeishas('default', {
        characterPool: oversizedCharacterPool,
        randomSource: createDeterministicRandomSource([7, 0, 6, 1, 5, 2, 4, 3])
    });

    assertSevenUniqueBoard(board, oversizedCharacterPool);
    assert.equal(board.length, 7);
    assert.equal(oversizedCharacterPool.length, 8);
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

test('invalid character pools reject duplicate and incomplete profiles', () => {
    assert.throws(
        () => validateCharacterSetData('default', duplicateCharacterPool),
        /Duplicate geisha characterId/
    );

    assert.throws(
        () => validateCharacterSetData('default', incompleteCharacterPool),
        /must include characterId, name, and imageUrl/
    );
});

test('room snapshot set resolution preserves supported sets and rejects unknown sets', () => {
    assert.equal(resolveRestorableGeishaSet({ geishaSet: 'collaboration' }), 'collaboration');
    assert.equal(resolveRestorableGeishaSet({ gameState: { geishaSet: 'hololive' } }), 'hololive');
    assert.equal(resolveRestorableGeishaSet({ geishaSet: null, gameState: { geishaSet: 'hololive' } }), 'hololive');

    assert.throws(
        () => resolveRestorableGeishaSet({}),
        /Missing geisha set in room snapshot/
    );

    assert.throws(
        () => resolveRestorableGeishaSet({ geishaSet: 'akatsuki' }),
        /Unsupported geisha set in room snapshot/
    );

    assert.throws(
        () => resolveRestorableGeishaSet(
            { geishaSet: 'hololive' },
            { isSupportedSet: () => false }
        ),
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

    const duplicateCharacterBoard = hololiveBoard.map((geisha, index) => (
        index === 6 ? { ...geisha, characterId: hololiveBoard[0].characterId } : geisha
    ));
    assert.throws(
        () => validateMatchBoardForSet('hololive', duplicateCharacterBoard),
        /unique characters/
    );

    const duplicateSlotBoard = hololiveBoard.map((geisha, index) => (
        index === 6 ? { ...geisha, boardSlotId: hololiveBoard[0].boardSlotId } : geisha
    ));
    assert.throws(
        () => validateMatchBoardForSet('hololive', duplicateSlotBoard),
        /unique board slots/
    );
});

test('room snapshots must include a valid seven-character board for restore', () => {
    const hololiveBoard = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([1, 2, 3, 4, 5, 6, 7])
    });

    assert.deepEqual(
        resolveRestorableBoardForSet({ baseGeishas: hololiveBoard }, 'hololive'),
        hololiveBoard
    );

    assert.throws(
        () => resolveRestorableBoardForSet({}, 'hololive'),
        /Missing match board/
    );

    assert.throws(
        () => resolveRestorableBoardForSet({ baseGeishas: hololiveBoard.slice(0, 6) }, 'hololive'),
        /exactly seven geishas/
    );

    const differentHololiveBoard = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([6, 5, 4, 3, 2, 1, 0])
    });
    assert.throws(
        () => resolveRestorableBoardForSet({
            baseGeishas: hololiveBoard,
            gameState: {
                geishas: differentHololiveBoard
            }
        }, 'hololive'),
        /must match the saved base board/
    );
});

test('pending interactions are fully visible only to the responding player', () => {
    const offeredCards = [
        { id: 'gift-1', geishaId: 1, type: 'item' },
        { id: 'gift-2', geishaId: 2, type: 'item' },
        { id: 'gift-3', geishaId: 3, type: 'item' }
    ];
    const giftPending = {
        type: 'GIFT_SELECTION',
        initiatorId: 'player1',
        targetPlayerId: 'player2',
        offeredCards
    };

    assert.deepEqual(
        sanitizePendingInteractionForViewer(giftPending, 'player2'),
        giftPending
    );
    assert.deepEqual(
        sanitizePendingInteractionForViewer(giftPending, 'player1'),
        { ...giftPending, offeredCards: [] }
    );

    const competitionPending = {
        type: 'COMPETITION_SELECTION',
        initiatorId: 'player1',
        targetPlayerId: 'player2',
        groups: [[offeredCards[0], offeredCards[1]], [offeredCards[2], offeredCards[0]]]
    };

    assert.deepEqual(
        sanitizePendingInteractionForViewer(competitionPending, 'player2'),
        competitionPending
    );
    assert.deepEqual(
        sanitizePendingInteractionForViewer(competitionPending, 'player1'),
        { ...competitionPending, groups: [] }
    );
});

test('joiner waiting state uses the room creator selected set and generated board', () => {
    const collaborationBoard = createRandomizedGeishas('collaboration', {
        randomSource: createDeterministicRandomSource([3, 1, 4, 1, 5, 9, 2])
    });
    const waitingState = createWaitingGameState(
        'room-1',
        ['player1', 'player2'],
        collaborationBoard,
        'collaboration',
        {
            player1: { name: 'Host' },
            player2: { name: 'Joiner' }
        }
    );

    assert.equal(waitingState.geishaSet, 'collaboration');
    assert.deepEqual(waitingState.players.map((player) => player.id), ['player1', 'player2']);
    assert.deepEqual(
        serializeBoardIdentity(waitingState.geishas),
        serializeBoardIdentity(collaborationBoard)
    );

    const existingState = {
        ...waitingState,
        players: [
            createPlayer('player1', { name: 'Host' }),
            createPlayer('player2', { name: 'Joiner' })
        ],
        geishaSet: 'collaboration',
        round: 2
    };
    existingState.players[0].actionTokens[0].used = true;

    const { gameState } = createGameStateWithOrder(
        'room-1',
        ['player2', 'player1'],
        collaborationBoard,
        existingState
    );

    assert.equal(gameState.geishaSet, 'collaboration');
    assert.equal(gameState.round, 2);
    assert.equal(gameState.players[1].actionTokens[0].used, true);
    assert.deepEqual(
        serializeBoardIdentity(gameState.geishas),
        serializeBoardIdentity(collaborationBoard)
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

test('ordered game state reuses provided base geishas instead of sampling a new board', () => {
    const baseBoard = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([2, 4, 6, 1, 3, 5, 0])
    });
    const existingState = createWaitingGameState(
        'room-ordered',
        ['player1', 'player2'],
        baseBoard,
        'hololive'
    );

    const { gameState } = createGameStateWithOrder(
        'room-ordered',
        ['player1', 'player2'],
        baseBoard,
        existingState
    );

    assert.deepEqual(serializeBoardIdentity(gameState.geishas), serializeBoardIdentity(baseBoard));
    assert.notEqual(gameState.geishas[0], baseBoard[0]);
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
