import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import { hololiveCharacterPool } from './geishaSetRules.js';
import { createDeterministicRandomSource } from './gameRandomSource.js';
import {
    cloneGeishas,
    cloneGeishasForNextRound,
    createCustomSelectedGeishas,
    createRandomizedGeishas
} from './geishaBoardFactory.js';

const serializeBoard = (geishas: Geisha[]) => geishas.map((geisha) => ({
    characterId: geisha.characterId,
    boardSlotId: geisha.boardSlotId,
    charmPoints: geisha.charmPoints,
    controlledBy: geisha.controlledBy
}));

test('geisha board factory creates reproducible randomized boards', () => {
    const boardA = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });
    const boardB = createRandomizedGeishas('hololive', {
        randomSource: createDeterministicRandomSource([0, 1, 2, 3, 4, 5, 6])
    });

    assert.deepEqual(serializeBoard(boardA), serializeBoard(boardB));
    assert.equal(boardA.length, 7);
    assert.deepEqual(boardA.map((geisha) => geisha.boardSlotId), [1, 2, 3, 4, 5, 6, 7]);
});

test('custom selected geishas preserve selected identities while allowing deterministic slot reassignment', () => {
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

test('clone helpers keep board values without sharing geisha objects', () => {
    const board = createRandomizedGeishas('collaboration', {
        randomSource: createDeterministicRandomSource([3, 1, 4, 1, 5, 9, 2])
    });
    board[0].controlledBy = 'player1';

    const clonedBoard = cloneGeishas(board);
    const nextRoundBoard = cloneGeishasForNextRound(board);

    assert.deepEqual(serializeBoard(clonedBoard), serializeBoard(board));
    assert.deepEqual(serializeBoard(nextRoundBoard), serializeBoard(board));
    assert.notEqual(clonedBoard[0], board[0]);
    assert.notEqual(nextRoundBoard[0], board[0]);
});
