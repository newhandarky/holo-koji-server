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
    applyTradeOffAction
} from './activeActionTransitions.js';

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

test('secret transition moves one card, marks token, closes replay, and keeps input immutable', () => {
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

test('secret transition preserves current error messages', () => {
    const player = makePlayer('player-a', ['card-1']);

    assert.deepEqual(applySecretAction(player), {
        ok: false,
        errorMessage: '請選擇 1 張卡片作為密約'
    });
    assert.deepEqual(applySecretAction(player, 'missing'), {
        ok: false,
        errorMessage: '卡片不在你的手牌中'
    });
});

test('trade-off transition discards two cards and keeps failed input immutable', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2', 'card-3']);
    const snapshot = structuredClone(player);

    const result = applyTradeOffAction(player, ['card-2', 'card-1']);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(player, snapshot);
    assert.deepEqual(result.value.player.hand.map(card => card.id), ['card-3']);
    assert.deepEqual(result.value.player.discardedCards.map(card => card.id), ['card-2', 'card-1']);
    assert.equal(result.value.player.actionTokens.find(token => token.type === 'trade-off')?.used, true);
    assert.deepEqual(result.value.revealedCardIds, ['card-2', 'card-1']);

    assert.deepEqual(applyTradeOffAction(player, ['card-1', 'card-1']), {
        ok: false,
        errorMessage: '卡片選擇重複'
    });
    assert.deepEqual(player, snapshot);
});

test('trade-off transition preserves selection count and fallback validation errors', () => {
    const player = makePlayer('player-a', ['card-1']);

    assert.deepEqual(applyTradeOffAction(player, ['card-1']), {
        ok: false,
        errorMessage: '取捨必須選擇 2 張卡片'
    });
    assert.deepEqual(applyTradeOffAction(player, ['card-1', 'missing']), {
        ok: false,
        errorMessage: '選擇的卡片不在你的手牌中'
    });
});
