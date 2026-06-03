import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import {
    ginzaBoardSlotDefinitions,
    hololiveCharacterPool
} from './geishaSetCatalog.js';
import {
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    validateMatchBoardForCustomSelection,
    validateMatchBoardForSet
} from './geishaBoardRestoreRules.js';

const makeBoard = (pool = hololiveCharacterPool): Geisha[] => (
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

test('restorable set resolution preserves missing and unsupported snapshot errors', () => {
    assert.equal(resolveRestorableGeishaSet({ gameState: { geishaSet: 'hololive' } }), 'hololive');
    assert.equal(resolveRestorableGeishaSet({ geishaSet: 'collaboration' }), 'collaboration');
    assert.throws(() => resolveRestorableGeishaSet({}), /Missing geisha set/);
    assert.throws(
        () => resolveRestorableGeishaSet({ geishaSet: 'akatsuki' }),
        /Unsupported geisha set in room snapshot: akatsuki/
    );
});

test('match board validation preserves set membership and unique board constraints', () => {
    const board = makeBoard();
    assert.doesNotThrow(() => validateMatchBoardForSet('hololive', board));
    assert.throws(
        () => validateMatchBoardForSet('hololive', board.slice(0, 6)),
        /exactly seven/
    );
    assert.throws(
        () => validateMatchBoardForSet('hololive', [
            { ...board[0]! },
            { ...board[0]!, boardSlotId: ginzaBoardSlotDefinitions[1]!.slotId },
            ...board.slice(2)
        ]),
        /unique characters/
    );
    assert.throws(
        () => validateMatchBoardForSet('hololive', [
            { ...board[0]!, boardSlotId: 99 },
            ...board.slice(1)
        ]),
        /unknown board slot/
    );
});

test('custom match board validation enforces selected character membership', () => {
    const selectedIds = hololiveCharacterPool.slice(0, 7).map((character) => character.characterId);
    const board = makeBoard(hololiveCharacterPool.slice(0, 7));

    assert.doesNotThrow(() => validateMatchBoardForCustomSelection('hololive', board, { characterIds: selectedIds }));
    assert.throws(
        () => validateMatchBoardForCustomSelection('hololive', board, {
            characterIds: [...selectedIds.slice(0, 6), 'ginza-ema']
        }),
        /outside the selected set/
    );
});

test('restorable board resolution preserves base board and game state consistency checks', () => {
    const board = makeBoard();
    const matchingStateBoard = board.map((geisha) => ({ ...geisha }));
    const mismatchedStateBoard = matchingStateBoard.map((geisha, index) => (
        index === 0
            ? { ...geisha, boardSlotId: ginzaBoardSlotDefinitions[1]!.slotId }
            : index === 1
                ? { ...geisha, boardSlotId: ginzaBoardSlotDefinitions[0]!.slotId }
            : geisha
    ));

    assert.equal(resolveRestorableBoardForSet({ baseGeishas: board }, 'hololive'), board);
    assert.equal(
        resolveRestorableBoardForSet({ baseGeishas: board, gameState: { geishas: matchingStateBoard } }, 'hololive'),
        board
    );
    assert.throws(
        () => resolveRestorableBoardForSet({}, 'hololive'),
        /Missing match board/
    );
    assert.throws(
        () => resolveRestorableBoardForSet({ baseGeishas: board, gameState: { geishas: mismatchedStateBoard } }, 'hololive'),
        /must match the saved base board/
    );
});
