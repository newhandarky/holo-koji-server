import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import { buildOpeningDealSummary } from './deckOpeningFactory.js';
import { createDeterministicRandomSource } from './gameRandomSource.js';
import { createRandomizedGeishas } from './geishaBoardFactory.js';
import {
    createGameStateWithOrder,
    createPlayer,
    createWaitingGameState
} from './serverGameStateFactory.js';

const serializeBoard = (geishas: Geisha[]) => geishas.map((geisha) => ({
    characterId: geisha.characterId,
    boardSlotId: geisha.boardSlotId,
    charmPoints: geisha.charmPoints,
    controlledBy: geisha.controlledBy
}));

test('createPlayer applies metadata and initializes empty player zones', () => {
    const player = createPlayer('player-1', {
        name: 'Player One',
        lineUserId: 'line-player-1',
        avatarUrl: 'https://example.test/avatar.png'
    });

    assert.equal(player.id, 'player-1');
    assert.equal(player.name, 'Player One');
    assert.equal(player.lineUserId, 'line-player-1');
    assert.equal(player.avatarUrl, 'https://example.test/avatar.png');
    assert.deepEqual(player.hand, []);
    assert.deepEqual(player.playedCards, []);
    assert.deepEqual(player.secretCards, []);
    assert.deepEqual(player.discardedCards, []);
    assert.deepEqual(player.actionTokens.map((token) => token.type), [
        'secret',
        'trade-off',
        'gift',
        'competition'
    ]);
    assert.ok(player.actionTokens.every((token) => token.used === false));
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
    existingState.openingDeal = buildOpeningDealSummary([], {
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
