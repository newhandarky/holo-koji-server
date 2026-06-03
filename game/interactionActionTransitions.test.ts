import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    ActionType,
    ItemCard,
    Player
} from '@newhandarky/hanakoji-game-types';
import {
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from './interactionActionTransitions.js';

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

test('gift initiation removes offered cards, marks token, and keeps input immutable', () => {
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

test('gift transition preserves target and invalid selection errors', () => {
    const player = makePlayer('player-a', ['card-1', 'card-2']);
    const players = [makePlayer('player-a'), makePlayer('player-b')];

    assert.deepEqual(initiateGiftAction(player, null, ['card-1', 'card-2', 'card-3']), {
        ok: false,
        errorMessage: '選擇的卡片不在你的手牌中'
    });
    assert.deepEqual(resolveGiftAction(players, {
        type: 'GIFT_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        offeredCards: ['card-1'].map(makeCard)
    }, 'player-a', 'card-1'), {
        ok: false,
        errorMessage: '你不是贈予的目標玩家'
    });
});

test('gift resolution distributes chosen and remaining cards without mutation', () => {
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

test('competition initiation preserves grouped cards and duplicate rejection atomically', () => {
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
    assert.equal(result.value.player.actionTokens.find(token => token.type === 'competition')?.used, true);
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

test('competition transition preserves target and invalid group errors', () => {
    const players = [makePlayer('player-a'), makePlayer('player-b')];

    assert.deepEqual(resolveCompetitionAction(players, {
        type: 'COMPETITION_SELECTION',
        initiatorId: 'player-a',
        targetPlayerId: 'player-b',
        groups: [['card-1'].map(makeCard), ['card-2'].map(makeCard)]
    }, 'player-a', 0), {
        ok: false,
        errorMessage: '你不是競爭的目標玩家'
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
});
