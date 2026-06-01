import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getActionAvailabilityError,
    getCardOwnershipError,
    getPendingInteractionError,
    toCompetitionGroups,
    toStringArray
} from './actionValidation.js';

const makePlayer = () => ({
    actionTokens: [
        { type: 'secret' as const, used: false },
        { type: 'gift' as const, used: true }
    ],
    hand: [
        { id: 'card-1' },
        { id: 'card-2' },
        { id: 'card-3' },
        { id: 'card-4' }
    ]
});

test('payload normalizers retain string card ids and valid non-empty competition groups', () => {
    assert.deepEqual(toStringArray(['card-1', 2, null, 'card-2']), ['card-1', 'card-2']);
    assert.deepEqual(
        toCompetitionGroups([['card-1', 2], null, [], ['card-2', 'card-3']]),
        [['card-1'], ['card-2', 'card-3']]
    );
    assert.deepEqual(toStringArray('card-1'), []);
    assert.deepEqual(toCompetitionGroups('card-1'), []);
});

test('action availability accepts unused tokens and rejects missing or used tokens', () => {
    const player = makePlayer();

    assert.equal(getActionAvailabilityError(player, 'secret'), null);
    assert.equal(getActionAvailabilityError(player, 'gift'), '該行動已使用或不存在');
    assert.equal(getActionAvailabilityError(player, 'competition'), '該行動已使用或不存在');
});

test('card ownership accepts owned unique cards', () => {
    assert.equal(getCardOwnershipError(makePlayer(), ['card-1', 'card-2']), null);
});

test('card ownership rejects duplicate cards before unowned cards', () => {
    assert.equal(getCardOwnershipError(makePlayer(), ['missing', 'missing']), '卡片選擇重複');
});

test('card ownership rejects cards outside the player hand', () => {
    assert.equal(getCardOwnershipError(makePlayer(), ['card-1', 'missing']), '選擇的卡片不在你的手牌中');
});

test('pending interaction validation preserves initiate and resolve gating', () => {
    const pending = { type: 'GIFT_SELECTION' };

    assert.equal(getPendingInteractionError(null, 'PLAY_SECRET'), null);
    assert.equal(getPendingInteractionError(pending, 'RESOLVE_GIFT'), null);
    assert.equal(getPendingInteractionError(pending, 'PLAY_SECRET'), '目前正在等待對手回應');
    assert.equal(getPendingInteractionError(null, 'RESOLVE_GIFT'), '目前沒有等待處理的互動');
});

test('validation helpers do not mutate player input', () => {
    const player = makePlayer();
    const snapshot = structuredClone(player);

    getActionAvailabilityError(player, 'secret');
    getCardOwnershipError(player, ['card-1', 'card-2']);

    assert.deepEqual(player, snapshot);
});
