import test from 'node:test';
import assert from 'node:assert/strict';
import type { Geisha } from '@newhandarky/hanakoji-game-types';
import {
    determineWinner,
    getNextRoundOrder,
    resolveRoundBoard,
    type RoundResolutionPlayer,
    type ScoredRoundPlayer
} from './roundResolution.js';

const makeGeisha = (id: number, charmPoints: number, controlledBy: string | null = null): Geisha => ({
    id,
    name: `Geisha ${id}`,
    charmPoints,
    imageUrl: `https://example.test/geisha-${id}.png`,
    controlledBy
});

const makePlayer = (
    id: string,
    geishaIds: number[] = []
): RoundResolutionPlayer => ({
    id,
    playedCards: geishaIds.map((geishaId, index) => ({
        id: `${id}-${geishaId}-${index}`,
        geishaId,
        type: 'item'
    }))
});

const makeScoredPlayer = (
    id: string,
    charm: number,
    tokens: number
): ScoredRoundPlayer => ({
    id,
    score: {
        charm,
        tokens
    }
});

test('resolveRoundBoard assigns geisha control to the player with more cards', () => {
    const result = resolveRoundBoard(
        [makeGeisha(1, 5)],
        [makePlayer('player-a', [1, 1]), makePlayer('player-b', [1])]
    );

    assert.equal(result.geishas[0]?.controlledBy, 'player-a');
});

test('resolveRoundBoard preserves existing geisha control when card counts tie', () => {
    const result = resolveRoundBoard(
        [makeGeisha(1, 5, 'player-b')],
        [makePlayer('player-a', [1]), makePlayer('player-b', [1])]
    );

    assert.equal(result.geishas[0]?.controlledBy, 'player-b');
});

test('resolveRoundBoard does not mutate input geishas', () => {
    const geishas = [makeGeisha(1, 5, 'player-b')];

    const result = resolveRoundBoard(
        geishas,
        [makePlayer('player-a', [1, 1]), makePlayer('player-b')]
    );

    assert.equal(geishas[0]?.controlledBy, 'player-b');
    assert.equal(result.geishas[0]?.controlledBy, 'player-a');
    assert.notEqual(result.geishas[0], geishas[0]);
});

test('resolveRoundBoard calculates charm and token scores from resolved control', () => {
    const result = resolveRoundBoard(
        [
            makeGeisha(1, 5),
            makeGeisha(2, 4, 'player-b'),
            makeGeisha(3, 2, 'player-b')
        ],
        [makePlayer('player-a', [1]), makePlayer('player-b')]
    );

    assert.deepEqual(result.scores.get('player-a'), { charm: 5, tokens: 1 });
    assert.deepEqual(result.scores.get('player-b'), { charm: 6, tokens: 2 });
});

test('determineWinner uses the higher charm score when the charm threshold is reached', () => {
    assert.equal(
        determineWinner([
            makeScoredPlayer('player-a', 11, 3),
            makeScoredPlayer('player-b', 12, 2)
        ]),
        'player-b'
    );
});

test('determineWinner uses token score when neither player reaches the charm threshold', () => {
    assert.equal(
        determineWinner([
            makeScoredPlayer('player-a', 9, 4),
            makeScoredPlayer('player-b', 10, 3)
        ]),
        'player-a'
    );
});

test('determineWinner returns null for threshold ties and unfinished rounds', () => {
    assert.equal(
        determineWinner([
            makeScoredPlayer('player-a', 11, 4),
            makeScoredPlayer('player-b', 11, 3)
        ]),
        null
    );
    assert.equal(
        determineWinner([
            makeScoredPlayer('player-a', 10, 3),
            makeScoredPlayer('player-b', 9, 3)
        ]),
        null
    );
    assert.equal(
        determineWinner([
            makeScoredPlayer('player-a', 9, 4),
            makeScoredPlayer('player-b', 10, 4)
        ]),
        null
    );
});

test('getNextRoundOrder alternates the starting player and rejects incomplete rooms', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];

    assert.deepEqual(getNextRoundOrder(players, 'player-a'), ['player-b', 'player-a']);
    assert.deepEqual(getNextRoundOrder(players, 'player-b'), ['player-a', 'player-b']);
    assert.deepEqual(getNextRoundOrder(players, null), ['player-b', 'player-a']);
    assert.deepEqual(getNextRoundOrder(players.slice(0, 1), 'player-a'), []);
});
