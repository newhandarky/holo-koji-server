import type {
    AchievementCatalogItem,
    AchievementId,
    AchievementItemState,
    AchievementSummaryItem
} from '@newhandarky/hanakoji-game-types';

export interface AchievementProgressRecord {
    lineUserId: string;
    achievementId: AchievementId;
    currentValue: number;
    target: number;
    updatedAt: string;
}

export interface AchievementUnlockRecord {
    lineUserId: string;
    achievementId: AchievementId;
    unlockedAt: string;
    seenAt?: string;
}

interface BuildProgressInput {
    item: AchievementCatalogItem;
    existing?: AchievementProgressRecord;
    lineUserId: string;
    won: boolean;
    completedAt: string;
}

export const buildNextAchievementProgress = ({
    item,
    existing,
    lineUserId,
    won,
    completedAt
}: BuildProgressInput): AchievementProgressRecord => {
    const increment = item.conditionType === 'completed_games' || (item.conditionType === 'wins' && won) ? 1 : 0;
    return {
        lineUserId,
        achievementId: item.achievementId,
        currentValue: (existing?.currentValue ?? 0) + increment,
        target: item.target,
        updatedAt: completedAt
    };
};

export const shouldUnlockAchievement = (
    progress: AchievementProgressRecord,
    existingUnlock?: AchievementUnlockRecord
): boolean => !existingUnlock && progress.currentValue >= progress.target;

export const buildAchievementUnlockRecord = (
    progress: AchievementProgressRecord,
    unlockedAt: string
): AchievementUnlockRecord => ({
    lineUserId: progress.lineUserId,
    achievementId: progress.achievementId,
    unlockedAt
});

export const buildAchievementSummaryItem = (
    item: AchievementCatalogItem,
    progress?: AchievementProgressRecord,
    unlock?: AchievementUnlockRecord
): AchievementSummaryItem => {
    const currentValue = Math.min(progress?.currentValue ?? 0, item.target);
    const state: AchievementItemState = unlock
        ? 'unlocked'
        : currentValue > 0
            ? 'in_progress'
            : 'locked';

    return {
        achievementId: item.achievementId,
        title: item.title,
        description: item.description,
        state,
        currentValue,
        target: item.target,
        ...(unlock ? { unlockedAt: unlock.unlockedAt } : {}),
        isNew: Boolean(unlock && !unlock.seenAt)
    };
};

export const countNewAchievementUnlocks = (items: AchievementSummaryItem[]): number => (
    items.filter((item) => item.isNew).length
);
