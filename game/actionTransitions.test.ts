import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    ActionType,
    ItemCard,
    OpeningDealSummary,
    Player
} from '@newhandarky/hanakoji-game-types';
import {
    applySecretAction,
    applyTradeOffAction,
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from './actionTransitions.js';

const makeCard = (id: string): ItemCard => ({
    id,
    geishaId: 1,
    type: 'item'
});

const makePlayer = (id: string, cardIds: string[] = []): Player => ({
    id,
    name: id,
    hand: cardIds.map(makeCard),
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: (['secret', 'trade-off', 'gift', 'competition'] as ActionType[])
        .map(type => ({ type, used: false })),
    score: { charm: 0, tokens: 0 }
});

const makeOpeningDeal = (): OpeningDealSummary => ({
    sequenceId: 'deal-1',
    status: 'completed',
    completed: true,
    replayable: true,
    steps: []
});

test('secret action moves one card, marks token, closes replay and keeps input immutable', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2']);
    const snapshot = structuredClone(player);

    const result = applySecretAction(player, 'card-1', makeOpeningDeal());

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(player, snapshot);
    assert.deepEqual(result.value.player.hand.map(card => card.id), ['card-2']);
    assert.deepEqual(result.value.player.secretCards.map(card => card.id), ['card-1']);
    assert.equal(result.value.player.actionTokens.find(token => token.type === 'secret')?.used, true);
    assert.equal(result.value.openingDeal?.replayable, false);
    assert.deepEqual(result.value.revealedCardIds, ['card-1']);
});

test('trade-off moves two cards to discarded state without mutating failed input', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2', 'card-3']);
    const snapshot = structuredClone(player);

    const result = applyTradeOffAction(player, ['card-2', 'card-1']);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(player, snapshot);
    assert.deepEqual(result.value.player.hand.map(card => card.id), ['card-3']);
    assert.deepEqual(result.value.player.discardedCards.map(card => card.id), ['card-2', 'card-1']);
    assert.deepEqual(result.value.revealedCardIds, ['card-2', 'card-1']);

    assert.deepEqual(applyTradeOffAction(player, ['card-1', 'card-1']), {
        ok: false,
        errorMessage: '卡片選擇重複'
    });
    assert.deepEqual(player, snapshot);
});

test('gift initiation removes offered cards and exposes them only through pending state', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2', 'card-3', 'card-4']);
    const snapshot = structuredClone(player);

    const result = initiateGiftAction(player, 'player-b', ['card-1', 'card-3', 'card-2']);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(player, snapshot);
    assert.deepEqual(result.value.player.hand.map(card => card.id), ['card-4']);
    assert.equal(result.value.player.actionTokens.find(token => token.type === 'gift')?.used, true);
    assert.equal(result.value.pendingInteraction.type, 'GIFT_SELECTION');
    if (result.value.pendingInteraction.type !== 'GIFT_SELECTION') return;
    assert.deepEqual(result.value.pendingInteraction.offeredCards?.map(card => card.id), ['card-1', 'card-3', 'card-2']);
});

test('gift resolution distributes chosen and remaining cards without mutating input', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];
    const snapshot = structuredClone(players);

    const result = resolveGiftAction(players, {
        type: 'GIFT_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        offeredCards: ['card-1', 'card-2', 'card-3'].map(makeCard)
    }, 'player-b', 'card-2');

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(players, snapshot);
    assert.deepEqual(result.value.players[0]?.playedCards.map(card => card.id), ['card-1', 'card-3']);
    assert.deepEqual(result.value.players[1]?.playedCards.map(card => card.id), ['card-2']);
    assert.equal(result.value.pendingInteraction, null);
});

test('competition initiation preserves groups and rejects duplicate selections atomically', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2', 'card-3', 'card-4']);
    const snapshot = structuredClone(player);

    const result = initiateCompetitionAction(player, 'player-b', [
        ['card-1', 'card-3'],
        ['card-2', 'card-4']
    ]);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(player, snapshot);
    assert.deepEqual(result.value.player.hand, []);
    assert.equal(result.value.pendingInteraction.type, 'COMPETITION_SELECTION');
    if (result.value.pendingInteraction.type !== 'COMPETITION_SELECTION') return;
    assert.deepEqual(
        result.value.pendingInteraction.groups?.map(group => group.map(card => card.id)),
        [['card-1', 'card-3'], ['card-2', 'card-4']]
    );

    assert.deepEqual(initiateCompetitionAction(player, 'player-b', [
        ['card-1', 'card-2'],
        ['card-2', 'card-3']
    ]), {
        ok: false,
        errorMessage: '卡片選擇重複'
    });
    assert.deepEqual(player, snapshot);
});

test('competition resolution distributes selected and remaining groups without mutation', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];
    const snapshot = structuredClone(players);

    const result = resolveCompetitionAction(players, {
        type: 'COMPETITION_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        groups: [
            ['card-1', 'card-2'].map(makeCard),
            ['card-3', 'card-4'].map(makeCard)
        ]
    }, 'player-b', 1);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(players, snapshot);
    assert.deepEqual(result.value.players[0]?.playedCards.map(card => card.id), ['card-1', 'card-2']);
    assert.deepEqual(result.value.players[1]?.playedCards.map(card => card.id), ['card-3', 'card-4']);
    assert.equal(result.value.pendingInteraction, null);
});

test('invalid gift and competition responses fail without partial updates', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];
    const snapshot = structuredClone(players);

    assert.deepEqual(resolveGiftAction(players, {
        type: 'GIFT_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        offeredCards: ['card-1'].map(makeCard)
    }, 'player-b', 'missing'), {
        ok: false,
        errorMessage: '選擇的卡片不存在'
    });
    assert.deepEqual(resolveCompetitionAction(players, {
        type: 'COMPETITION_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        groups: [['card-1'].map(makeCard), ['card-2'].map(makeCard)]
    }, 'player-b', 2), {
        ok: false,
        errorMessage: '選擇的組別不存在'
    });
    assert.deepEqual(players, snapshot);
});
