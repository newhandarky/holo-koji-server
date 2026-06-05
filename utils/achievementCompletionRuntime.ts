import type {
    AccountPersistenceStatus
} from '@newhandarky/hanakoji-game-types';
import { ACHIEVEMENT_CATALOG } from './achievementCatalog.js';
import {
    buildAchievementUnlockRecord,
    buildNextAchievementProgress,
    shouldUnlockAchievement,
    type AchievementProgressRecord,
    type AchievementUnlockRecord
} from './achievementProgress.js';

export interface ProcessedCompletionRecord {
    completionId: string;
    processedAt: string;
    affectedLineUserIds: string[];
}

export interface AchievementPlayer {
    playerId: string;
    accountProfile?: {
        lineUserId?: string;
    } | null;
    [key: string]: unknown;
}

export interface AchievementMatchCompletionRequest {
    completionId?: string | null;
    completedAt?: string;
    winner?: string;
    players?: AchievementPlayer[];
}

export interface AchievementMatchCompletionResult {
    status: 'available' | 'unavailable';
    updates: AchievementProgressRecord[];
    persistenceStatus: AccountPersistenceStatus;
    completionId?: string;
}

type DurableStatus = {
    available: boolean;
    persistenceStatus: AccountPersistenceStatus;
};

type AchievementCompletionRuntimeOptions = {
    request?: AchievementMatchCompletionRequest;
    now: () => Date;
    getDurableStatus: () => DurableStatus;
    getPersistenceStatus: () => AccountPersistenceStatus;
    getProgress: (lineUserId: string, achievementId: AchievementProgressRecord['achievementId']) => Promise<AchievementProgressRecord | undefined>;
    setProgress: (record: AchievementProgressRecord) => Promise<void>;
    getUnlock: (lineUserId: string, achievementId: AchievementUnlockRecord['achievementId']) => Promise<AchievementUnlockRecord | undefined>;
    setUnlock: (record: AchievementUnlockRecord) => Promise<void>;
    getProcessedCompletion: (completionId: string) => Promise<ProcessedCompletionRecord | undefined>;
    setProcessedCompletion: (record: ProcessedCompletionRecord) => Promise<void>;
};

const buildUnavailableResult = (
    persistenceStatus: AccountPersistenceStatus
): AchievementMatchCompletionResult => ({
    status: 'unavailable',
    updates: [],
    persistenceStatus
});

const updatePlayerProgress = async (
    lineUserId: string,
    won: boolean,
    completedAt: string,
    helpers: Pick<AchievementCompletionRuntimeOptions, 'getProgress' | 'setProgress' | 'getUnlock' | 'setUnlock'>
): Promise<AchievementProgressRecord[]> => {
    const updates: AchievementProgressRecord[] = [];
    for (const item of ACHIEVEMENT_CATALOG) {
        const existing = await helpers.getProgress(lineUserId, item.achievementId);
        const nextProgress = buildNextAchievementProgress({
            item,
            existing,
            lineUserId,
            won,
            completedAt
        });
        await helpers.setProgress(nextProgress);

        const existingUnlock = await helpers.getUnlock(lineUserId, item.achievementId);
        if (shouldUnlockAchievement(nextProgress, existingUnlock)) {
            await helpers.setUnlock(buildAchievementUnlockRecord(nextProgress, completedAt));
        }
        updates.push(nextProgress);
    }
    return updates;
};

export const recordAchievementMatchCompletion = async ({
    request = {},
    now,
    getDurableStatus,
    getPersistenceStatus,
    getProgress,
    setProgress,
    getUnlock,
    setUnlock,
    getProcessedCompletion,
    setProcessedCompletion
}: AchievementCompletionRuntimeOptions): Promise<AchievementMatchCompletionResult> => {
    const {
        completionId,
        completedAt = now().toISOString(),
        winner,
        players = []
    } = request;
    const { available, persistenceStatus } = getDurableStatus();
    if (!available || !completionId) {
        return buildUnavailableResult(persistenceStatus);
    }

    try {
        const existingCompletion = await getProcessedCompletion(completionId);
        if (existingCompletion) {
            return {
                status: 'available',
                updates: [],
                persistenceStatus,
                completionId
            };
        }
    } catch (error) {
        return buildUnavailableResult(getPersistenceStatus());
    }

    try {
        const updates: AchievementProgressRecord[] = [];
        const affectedLineUserIds: string[] = [];
        for (const player of players) {
            const lineUserId = player?.accountProfile?.lineUserId;
            if (!lineUserId) {
                continue;
            }
            affectedLineUserIds.push(lineUserId);
            updates.push(...await updatePlayerProgress(lineUserId, player.playerId === winner, completedAt, {
                getProgress,
                setProgress,
                getUnlock,
                setUnlock
            }));
        }

        await setProcessedCompletion({
            completionId,
            processedAt: now().toISOString(),
            affectedLineUserIds
        });

        return {
            status: 'available',
            updates,
            persistenceStatus,
            completionId
        };
    } catch (error) {
        return buildUnavailableResult(getPersistenceStatus());
    }
};
