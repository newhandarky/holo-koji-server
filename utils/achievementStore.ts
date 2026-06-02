import type {
    AccountPersistenceStatus,
    AchievementId,
    AchievementStatus,
    AchievementStatusResult,
    AchievementSummaryItem
} from '@newhandarky/hanakoji-game-types';
import {
    createJsonPersistenceAdapter,
    type KeyValueClient
} from './persistenceAdapter.js';
import {
    ACHIEVEMENT_CATALOG,
    isAchievementId
} from './achievementCatalog.js';
import {
    buildAchievementSummaryItem,
    buildAchievementUnlockRecord,
    buildNextAchievementProgress,
    countNewAchievementUnlocks,
    shouldUnlockAchievement,
    type AchievementProgressRecord,
    type AchievementUnlockRecord
} from './achievementProgress.js';

export { ACHIEVEMENT_CATALOG } from './achievementCatalog.js';
export type {
    AchievementProgressRecord,
    AchievementUnlockRecord
} from './achievementProgress.js';

const REDIS_URL = process.env.REDIS_URL;
const ACHIEVEMENT_UNAVAILABLE_MESSAGE = '成就暫時不可用，進度目前無法保存。';
const ACHIEVEMENT_GUEST_MESSAGE = '成就需要綁定帳號後才會保存。';
const ACHIEVEMENT_PROGRESS_KEY_PREFIX = 'hanamikoji:achievement:progress:';
const ACHIEVEMENT_UNLOCK_KEY_PREFIX = 'hanamikoji:achievement:unlock:';
const ACHIEVEMENT_COMPLETION_KEY_PREFIX = 'hanamikoji:achievement:completion:';

interface ProcessedCompletionRecord {
    completionId: string;
    processedAt: string;
    affectedLineUserIds: string[];
}

interface AchievementPlayer {
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
    status: AchievementStatus;
    updates: AchievementProgressRecord[];
    persistenceStatus: AccountPersistenceStatus;
    completionId?: string;
}

export interface AchievementStore {
    getAchievementSummary: (lineUserId?: string | null, legacyProfile?: unknown) => Promise<AchievementStatusResult>;
    recordMatchCompletion: (request?: AchievementMatchCompletionRequest) => Promise<AchievementMatchCompletionResult>;
    acknowledgeNewUnlocks: (lineUserId?: string | null, achievementIds?: AchievementId[]) => Promise<AchievementStatusResult>;
}

interface AchievementStoreOptions {
    now?: () => Date;
    redisUrl?: string;
    redisClient?: KeyValueClient | null;
    getPersistenceStatus?: () => AccountPersistenceStatus;
}

const temporaryPersistenceStatus: AccountPersistenceStatus = {
    mode: 'temporary',
    available: true,
    message: 'Account profiles are temporary in this environment.'
};

export const createAchievementStore = ({
    now = () => new Date(),
    redisUrl = REDIS_URL,
    redisClient = null,
    getPersistenceStatus = () => temporaryPersistenceStatus
}: AchievementStoreOptions = {}): AchievementStore => {
    const persistence = createJsonPersistenceAdapter({
        redisUrl,
        redisClient,
        logLabel: 'Achievement',
        durableMessage: 'Account profiles are persistent.',
        temporaryMessage: 'Account profiles are temporary in this environment.',
        unavailableMessage: 'Account profiles are unavailable; durable persistence is not connected.'
    });

    const buildProgressKey = (lineUserId: string, achievementId: AchievementId) => `${lineUserId}:${achievementId}`;
    const buildRedisProgressKey = (lineUserId: string, achievementId: AchievementId) => `${ACHIEVEMENT_PROGRESS_KEY_PREFIX}${buildProgressKey(lineUserId, achievementId)}`;
    const buildRedisUnlockKey = (lineUserId: string, achievementId: AchievementId) => `${ACHIEVEMENT_UNLOCK_KEY_PREFIX}${buildProgressKey(lineUserId, achievementId)}`;
    const buildRedisCompletionKey = (completionId: string) => `${ACHIEVEMENT_COMPLETION_KEY_PREFIX}${completionId}`;

    const getDurableStatus = (): { available: boolean; persistenceStatus: AccountPersistenceStatus } => {
        const persistenceStatus = getPersistenceStatus();
        if (!persistence.getStorageFailure() && persistenceStatus.mode === 'durable' && persistenceStatus.available === true) {
            return { available: true, persistenceStatus };
        }

        return { available: false, persistenceStatus };
    };

    const buildGuestSummary = (persistenceStatus = getPersistenceStatus()): AchievementStatusResult => ({
        status: 'guest',
        message: ACHIEVEMENT_GUEST_MESSAGE,
        persistenceStatus
    });

    const buildUnavailableSummary = (persistenceStatus = getPersistenceStatus()): AchievementStatusResult => ({
        status: 'unavailable',
        message: ACHIEVEMENT_UNAVAILABLE_MESSAGE,
        persistenceStatus
    });

    const getProgress = async (lineUserId: string, achievementId: AchievementId): Promise<AchievementProgressRecord | undefined> => {
        return await persistence.getJson<AchievementProgressRecord>(buildRedisProgressKey(lineUserId, achievementId)) ?? undefined;
    };
    const setProgress = async (record: AchievementProgressRecord): Promise<void> => {
        await persistence.setJson(buildRedisProgressKey(record.lineUserId, record.achievementId), record);
    };

    const getUnlock = async (lineUserId: string, achievementId: AchievementId): Promise<AchievementUnlockRecord | undefined> => {
        return await persistence.getJson<AchievementUnlockRecord>(buildRedisUnlockKey(lineUserId, achievementId)) ?? undefined;
    };
    const setUnlock = async (record: AchievementUnlockRecord): Promise<void> => {
        await persistence.setJson(buildRedisUnlockKey(record.lineUserId, record.achievementId), record);
    };

    const getProcessedCompletion = async (completionId: string): Promise<ProcessedCompletionRecord | undefined> => {
        return await persistence.getJson<ProcessedCompletionRecord>(buildRedisCompletionKey(completionId)) ?? undefined;
    };
    const setProcessedCompletion = async (record: ProcessedCompletionRecord): Promise<void> => {
        await persistence.setJson(buildRedisCompletionKey(record.completionId), record);
    };

    const buildSummary = async (lineUserId: string, persistenceStatus: AccountPersistenceStatus): Promise<AchievementStatusResult> => {
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

    const getAchievementSummary = async (lineUserId?: string | null, _legacyProfile?: unknown): Promise<AchievementStatusResult> => {
        const { available, persistenceStatus } = getDurableStatus();
        if (!lineUserId) {
            return buildGuestSummary(persistenceStatus);
        }
        if (!available) {
            return buildUnavailableSummary(persistenceStatus);
        }

        try {
            return await buildSummary(lineUserId, persistenceStatus);
        } catch (error) {
            return buildUnavailableSummary(getPersistenceStatus());
        }
    };

    const updatePlayerProgress = async (lineUserId: string, won: boolean, completedAt: string): Promise<AchievementProgressRecord[]> => {
        const updates: AchievementProgressRecord[] = [];
        for (const item of ACHIEVEMENT_CATALOG) {
            const existing = await getProgress(lineUserId, item.achievementId);
            const nextProgress = buildNextAchievementProgress({
                item,
                existing,
                lineUserId,
                won,
                completedAt
            });
            await setProgress(nextProgress);

            const existingUnlock = await getUnlock(lineUserId, item.achievementId);
            if (shouldUnlockAchievement(nextProgress, existingUnlock)) {
                await setUnlock(buildAchievementUnlockRecord(nextProgress, completedAt));
            }
            updates.push(nextProgress);
        }
        return updates;
    };

    const recordMatchCompletion = async ({
        completionId,
        completedAt = now().toISOString(),
        winner,
        players = []
    }: AchievementMatchCompletionRequest = {}): Promise<AchievementMatchCompletionResult> => {
        const { available, persistenceStatus } = getDurableStatus();
        if (!available) {
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus
            };
        }

        if (!completionId) {
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus
            };
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
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus: getPersistenceStatus()
            };
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
                updates.push(...await updatePlayerProgress(lineUserId, player.playerId === winner, completedAt));
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
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus: getPersistenceStatus()
            };
        }
    };

    const acknowledgeNewUnlocks = async (lineUserId?: string | null, achievementIds: AchievementId[] = []): Promise<AchievementStatusResult> => {
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

    return {
        getAchievementSummary,
        recordMatchCompletion,
        acknowledgeNewUnlocks
    };
};

export const achievementStore = createAchievementStore();
