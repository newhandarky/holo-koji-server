import test from 'node:test';
import assert from 'node:assert/strict';
import {
    collaborationCharacterPool,
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    getCharacterPoolForSet,
    geishaSetMetadata,
    ginzaBoardSlotDefinitions,
    hololiveCharacterPool,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode,
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    validateCustomCharacterSelection,
    validateGinzaSetupData,
    validateMatchBoardForCustomSelection,
    validateMatchBoardForSet
} from './geishaSetRules.js';

const makeBoard = (pool = hololiveCharacterPool) => (
    ginzaBoardSlotDefinitions.map((slot, index) => {
        const character = pool[index]!;
        return {
            id: slot.slotId,
            characterId: character.characterId,
            boardSlotId: slot.slotId,
            name: character.name,
            imageUrl: character.imageUrl,
            charmPoints: slot.charmPoints,
            controlledBy: null
        };
    })
);

test('geisha set rules expose existing supported sets and defaults', () => {
    assert.equal(DEFAULT_GEISHA_SET, 'default');
    assert.equal(DEFAULT_ROOM_SETUP_MODE, 'random');
    assert.equal(normalizeGeishaSet(undefined), 'default');
    assert.equal(normalizeRoomSetupMode(undefined), 'random');
    assert.equal(isSupportedGeishaSet('hololive'), true);
    assert.equal(isSupportedGeishaSet('akatsuki'), false);
    assert.equal(geishaSetMetadata.hololive.label, 'Hololive');
    assert.equal(getCharacterPoolForSet('collaboration'), collaborationCharacterPool);
    assert.equal(getCharacterPoolForSet('hololive'), hololiveCharacterPool);
});

test('custom character selection keeps exact seven unique ids in the selected set', () => {
    const selectedIds = hololiveCharacterPool.slice(0, 7).map(character => character.characterId);

    assert.deepEqual(
        validateCustomCharacterSelection('hololive', { characterIds: selectedIds }),
        { characterIds: selectedIds }
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: selectedIds.slice(0, 6) }),
        /exactly 7/
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: [...selectedIds.slice(0, 6), selectedIds[0]] }),
        /unique/
    );
    assert.throws(
        () => validateCustomCharacterSelection('hololive', { characterIds: [...selectedIds.slice(0, 6), 'missing'] }),
        /outside the selected set/
    );
});

test('match board validation preserves set and custom-selection identity checks', () => {
    const selectedIds = hololiveCharacterPool.slice(0, 7).map(character => character.characterId);
    const hololiveBoard = makeBoard();
    const customBoard = makeBoard(hololiveCharacterPool.slice(0, 7));

    assert.doesNotThrow(() => validateMatchBoardForSet('hololive', hololiveBoard));
    assert.doesNotThrow(() => validateMatchBoardForCustomSelection('hololive', customBoard, { characterIds: selectedIds }));
    const duplicatedBoard = [
        { ...hololiveBoard[0]! },
        { ...hololiveBoard[0]!, boardSlotId: ginzaBoardSlotDefinitions[1]!.slotId },
        ...hololiveBoard.slice(2)
    ];
    assert.throws(
        () => validateMatchBoardForSet('hololive', duplicatedBoard),
        /unique characters/
    );
});

test('restorable room rules preserve set fallback and board consistency checks', () => {
    const board = makeBoard();

    assert.equal(resolveRestorableGeishaSet({ gameState: { geishaSet: 'hololive' } }), 'hololive');
    assert.equal(resolveRestorableBoardForSet({ baseGeishas: board }, 'hololive'), board);
    assert.throws(() => resolveRestorableGeishaSet({}), /Missing geisha set/);
    assert.throws(
        () => resolveRestorableBoardForSet({ baseGeishas: board.slice(0, 6) }, 'hololive'),
        /exactly seven/
    );
});

test('ginza board setup validation keeps production slot invariants', () => {
    assert.doesNotThrow(() => validateGinzaSetupData(undefined, ginzaBoardSlotDefinitions));
    assert.throws(
        () => validateGinzaSetupData(undefined, [{ ...ginzaBoardSlotDefinitions[0]! }]),
        /exactly seven/
    );
});
