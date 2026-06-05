import type {
    AccountPersistenceStatus,
    AchievementId,
    AchievementStatusResult,
    AchievementSummaryItem
} from '@newhandarky/hanakoji-game-types';
import {
    ACHIEVEMENT_CATALOG,
    isAchievementId
} from './achievementCatalog.js';
import {
    buildAchievementSummaryItem,
    countNewAchievementUnlocks,
    type AchievementProgressRecord,
    type AchievementUnlockRecord
} from './achievementProgress.js';

type DurableStatus = {
    available: boolean;
    persistenceStatus: AccountPersistenceStatus;
};

type AchievementSummaryRuntimeOptions = {
    lineUserId: string;
    persistenceStatus: AccountPersistenceStatus;
    now: () => Date;
    getProgress: (lineUserId: string, achievementId: AchievementId) => Promise<AchievementProgressRecord | undefined>;
    getUnlock: (lineUserId: string, achievementId: AchievementId) => Promise<AchievementUnlockRecord | undefined>;
};

type AcknowledgeAchievementUnlocksOptions = {
    lineUserId?: string | null;
    achievementIds?: AchievementId[];
    now: () => Date;
    getDurableStatus: () => DurableStatus;
    getPersistenceStatus: () => AccountPersistenceStatus;
    buildGuestSummary: (persistenceStatus?: AccountPersistenceStatus) => AchievementStatusResult;
    buildUnavailableSummary: (persistenceStatus?: AccountPersistenceStatus) => AchievementStatusResult;
    getUnlock: (lineUserId: string, achievementId: AchievementId) => Promise<AchievementUnlockRecord | undefined>;
    setUnlock: (record: AchievementUnlockRecord) => Promise<void>;
    buildSummary: (lineUserId: string, persistenceStatus: AccountPersistenceStatus) => Promise<AchievementStatusResult>;
};

export const buildAchievementSummary = async ({
    lineUserId,
    persistenceStatus,
    now,
    getProgress,
    getUnlock
}: AchievementSummaryRuntimeOptions): Promise<AchievementStatusResult> => {
    const items: AchievementSummaryItem[] = [];
    for (const item of ACHIEVEMENT_CATALOG) {
        const progress = await getProgress(lineUserId, item.achievementId);
        const unlock = await getUnlock(lineUserId, item.achievementId);
        items.push(buildAchievementSummaryItem(item, progress, unlock));
    }

    return {
        status: 'available',
        persistenceStatus,
        newUnlockCount: countNewAchievementUnlocks(items),
        items,
        generatedAt: now().toISOString()
    };
};

export const acknowledgeAchievementUnlocks = async ({
    lineUserId,
    achievementIds = [],
    now,
    getDurableStatus,
    getPersistenceStatus,
    buildGuestSummary,
    buildUnavailableSummary,
    getUnlock,
    setUnlock,
    buildSummary
}: AcknowledgeAchievementUnlocksOptions): Promise<AchievementStatusResult> => {
    const { available, persistenceStatus } = getDurableStatus();
    if (!lineUserId) {
        return buildGuestSummary(persistenceStatus);
    }
    if (!available) {
        return buildUnavailableSummary(persistenceStatus);
    }

    try {
        for (const achievementId of achievementIds) {
            if (!isAchievementId(achievementId)) {
                continue;
            }
            const unlock = await getUnlock(lineUserId, achievementId);
            if (!unlock || unlock.seenAt) {
                continue;
            }
            await setUnlock({
                ...unlock,
                seenAt: now().toISOString()
            });
        }

        return await buildSummary(lineUserId, persistenceStatus);
    } catch (error) {
        return buildUnavailableSummary(getPersistenceStatus());
    }
};
