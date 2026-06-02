import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ACHIEVEMENT_CATALOG,
    isAchievementId
} from './achievementCatalog.js';
import {
    buildAchievementSummaryItem,
    buildAchievementUnlockRecord,
    buildNextAchievementProgress,
    countNewAchievementUnlocks,
    shouldUnlockAchievement
} from './achievementProgress.js';

const completedGamesItem = ACHIEVEMENT_CATALOG.find((item) => item.achievementId === 'complete_3_matches');
const winsItem = ACHIEVEMENT_CATALOG.find((item) => item.achievementId === 'win_3_matches');

test('catalog keeps the four foundation achievement ids and targets', () => {
    assert.deepEqual(
        ACHIEVEMENT_CATALOG.map((item) => [item.achievementId, item.conditionType, item.target]),
        [
            ['first_completed_match', 'completed_games', 1],
            ['first_win', 'wins', 1],
            ['complete_3_matches', 'completed_games', 3],
            ['win_3_matches', 'wins', 3]
        ]
    );
});

test('buildNextAchievementProgress increments completed games every match', () => {
    assert.ok(completedGamesItem);

    const progress = buildNextAchievementProgress({
        item: completedGamesItem,
        existing: {
            lineUserId: 'U_HOST',
            achievementId: 'complete_3_matches',
            currentValue: 1,
            target: 3,
            updatedAt: '2026-05-05T12:00:00.000Z'
        },
        lineUserId: 'U_HOST',
        won: false,
        completedAt: '2026-05-05T14:00:00.000Z'
    });

    assert.deepEqual(progress, {
        lineUserId: 'U_HOST',
        achievementId: 'complete_3_matches',
        currentValue: 2,
        target: 3,
        updatedAt: '2026-05-05T14:00:00.000Z'
    });
});

test('buildNextAchievementProgress only increments wins when the player won', () => {
    assert.ok(winsItem);

    const lostProgress = buildNextAchievementProgress({
        item: winsItem,
        lineUserId: 'U_GUEST',
        won: false,
        completedAt: '2026-05-05T14:00:00.000Z'
    });
    const wonProgress = buildNextAchievementProgress({
        item: winsItem,
        existing: lostProgress,
        lineUserId: 'U_GUEST',
        won: true,
        completedAt: '2026-05-05T15:00:00.000Z'
    });

    assert.equal(lostProgress.currentValue, 0);
    assert.equal(wonProgress.currentValue, 1);
});

test('unlock helpers only create the first unlock when target is reached', () => {
    assert.ok(completedGamesItem);
    const progress = buildNextAchievementProgress({
        item: completedGamesItem,
        existing: {
            lineUserId: 'U_HOST',
            achievementId: 'complete_3_matches',
            currentValue: 2,
            target: 3,
            updatedAt: '2026-05-05T13:00:00.000Z'
        },
        lineUserId: 'U_HOST',
        won: false,
        completedAt: '2026-05-05T14:00:00.000Z'
    });
    const unlock = buildAchievementUnlockRecord(progress, progress.updatedAt);

    assert.equal(shouldUnlockAchievement(progress), true);
    assert.deepEqual(unlock, {
        lineUserId: 'U_HOST',
        achievementId: 'complete_3_matches',
        unlockedAt: '2026-05-05T14:00:00.000Z'
    });
    assert.equal(shouldUnlockAchievement(progress, unlock), false);
});

test('summary projection masks over-target progress and tracks unseen unlock count', () => {
    assert.ok(completedGamesItem);
    const locked = buildAchievementSummaryItem(completedGamesItem);
    const inProgress = buildAchievementSummaryItem(completedGamesItem, {
        lineUserId: 'U_HOST',
        achievementId: 'complete_3_matches',
        currentValue: 1,
        target: 3,
        updatedAt: '2026-05-05T13:00:00.000Z'
    });
    const unlocked = buildAchievementSummaryItem(
        completedGamesItem,
        {
            lineUserId: 'U_HOST',
            achievementId: 'complete_3_matches',
            currentValue: 5,
            target: 3,
            updatedAt: '2026-05-05T14:00:00.000Z'
        },
        {
            lineUserId: 'U_HOST',
            achievementId: 'complete_3_matches',
            unlockedAt: '2026-05-05T14:00:00.000Z'
        }
    );

    assert.equal(locked.state, 'locked');
    assert.equal(inProgress.state, 'in_progress');
    assert.equal(unlocked.state, 'unlocked');
    assert.equal(unlocked.currentValue, 3);
    assert.equal(countNewAchievementUnlocks([locked, inProgress, unlocked]), 1);
});

test('isAchievementId accepts only catalog ids', () => {
    assert.equal(isAchievementId('first_completed_match'), true);
    assert.equal(isAchievementId('not-real'), false);
    assert.equal(isAchievementId(null), false);
});
