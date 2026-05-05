import { createClient } from 'redis';
import { backendLogger } from './runtimeLogger.js';

const REDIS_URL = process.env.REDIS_URL;
const ACHIEVEMENT_UNAVAILABLE_MESSAGE = '成就暫時不可用，進度目前無法保存。';
const ACHIEVEMENT_GUEST_MESSAGE = '成就需要綁定帳號後才會保存。';
const ACHIEVEMENT_PROGRESS_KEY_PREFIX = 'hanamikoji:achievement:progress:';
const ACHIEVEMENT_UNLOCK_KEY_PREFIX = 'hanamikoji:achievement:unlock:';
const ACHIEVEMENT_COMPLETION_KEY_PREFIX = 'hanamikoji:achievement:completion:';

const temporaryPersistenceStatus = {
    mode: 'temporary',
    available: true,
    message: 'Account profiles are temporary in this environment.'
};

export const ACHIEVEMENT_CATALOG = [
    {
        achievementId: 'first_completed_match',
        title: '初次花見',
        description: '完成第一場對局。',
        conditionType: 'completed_games',
        target: 1
    },
    {
        achievementId: 'first_win',
        title: '初次勝利',
        description: '贏得第一場對局。',
        conditionType: 'wins',
        target: 1
    },
    {
        achievementId: 'complete_3_matches',
        title: '三度赴約',
        description: '完成 3 場對局。',
        conditionType: 'completed_games',
        target: 3
    },
    {
        achievementId: 'win_3_matches',
        title: '三勝之姿',
        description: '贏得 3 場對局。',
        conditionType: 'wins',
        target: 3
    }
];

export const createAchievementStore = ({
    now = () => new Date(),
    redisUrl = REDIS_URL,
    redisClient = null,
    getPersistenceStatus = () => temporaryPersistenceStatus
} = {}) => {
    const progressRecords = new Map();
    const unlockRecords = new Map();
    const processedCompletions = new Map();
    let client = redisClient;
    let storageFailure = null;

    const buildProgressKey = (lineUserId, achievementId) => `${lineUserId}:${achievementId}`;
    const buildRedisProgressKey = (lineUserId, achievementId) => `${ACHIEVEMENT_PROGRESS_KEY_PREFIX}${buildProgressKey(lineUserId, achievementId)}`;
    const buildRedisUnlockKey = (lineUserId, achievementId) => `${ACHIEVEMENT_UNLOCK_KEY_PREFIX}${buildProgressKey(lineUserId, achievementId)}`;
    const buildRedisCompletionKey = (completionId) => `${ACHIEVEMENT_COMPLETION_KEY_PREFIX}${completionId}`;

    const getClient = async () => {
        if (client) {
            if (client.isOpen === false && typeof client.connect === 'function') {
                try {
                    await client.connect();
                } catch (error) {
                    storageFailure = error;
                    throw error;
                }
            }
            return client;
        }
        if (!redisUrl) {
            return null;
        }

        client = createClient({ url: redisUrl });
        client.on('error', (error) => {
            backendLogger.error('❌ Achievement Redis 連線錯誤', {
                error: error instanceof Error ? error.message : 'unknown'
            });
        });

        if (!client.isOpen) {
            try {
                await client.connect();
                backendLogger.info('✅ Achievement Redis 連線成功');
            } catch (error) {
                storageFailure = error;
                client = null;
                throw error;
            }
        }
        return client;
    };

    const getDurableStatus = () => {
        const persistenceStatus = getPersistenceStatus();
        if (!storageFailure && persistenceStatus.mode === 'durable' && persistenceStatus.available === true) {
            return { available: true, persistenceStatus };
        }

        return { available: false, persistenceStatus };
    };

    const buildGuestSummary = (persistenceStatus = getPersistenceStatus()) => ({
        status: 'guest',
        message: ACHIEVEMENT_GUEST_MESSAGE,
        persistenceStatus
    });

    const buildUnavailableSummary = (persistenceStatus = getPersistenceStatus()) => ({
        status: 'unavailable',
        message: ACHIEVEMENT_UNAVAILABLE_MESSAGE,
        persistenceStatus
    });

    const getProgress = async (lineUserId, achievementId) => {
        const activeClient = await getClient();
        if (activeClient) {
            const raw = await activeClient.get(buildRedisProgressKey(lineUserId, achievementId));
            return raw ? JSON.parse(raw) : undefined;
        }
        return progressRecords.get(buildProgressKey(lineUserId, achievementId));
    };
    const setProgress = async (record) => {
        const activeClient = await getClient();
        if (activeClient) {
            await activeClient.set(buildRedisProgressKey(record.lineUserId, record.achievementId), JSON.stringify(record));
            return;
        }
        progressRecords.set(buildProgressKey(record.lineUserId, record.achievementId), record);
    };

    const getUnlock = async (lineUserId, achievementId) => {
        const activeClient = await getClient();
        if (activeClient) {
            const raw = await activeClient.get(buildRedisUnlockKey(lineUserId, achievementId));
            return raw ? JSON.parse(raw) : undefined;
        }
        return unlockRecords.get(buildProgressKey(lineUserId, achievementId));
    };
    const setUnlock = async (record) => {
        const activeClient = await getClient();
        if (activeClient) {
            await activeClient.set(buildRedisUnlockKey(record.lineUserId, record.achievementId), JSON.stringify(record));
            return;
        }
        unlockRecords.set(buildProgressKey(record.lineUserId, record.achievementId), record);
    };

    const getProcessedCompletion = async (completionId) => {
        const activeClient = await getClient();
        if (activeClient) {
            const raw = await activeClient.get(buildRedisCompletionKey(completionId));
            return raw ? JSON.parse(raw) : undefined;
        }
        return processedCompletions.get(completionId);
    };
    const setProcessedCompletion = async (record) => {
        const activeClient = await getClient();
        if (activeClient) {
            await activeClient.set(buildRedisCompletionKey(record.completionId), JSON.stringify(record));
            return;
        }
        processedCompletions.set(record.completionId, record);
    };

    const buildSummary = async (lineUserId, persistenceStatus) => {
        const items = [];
        for (const item of ACHIEVEMENT_CATALOG) {
            const progress = await getProgress(lineUserId, item.achievementId);
            const unlock = await getUnlock(lineUserId, item.achievementId);
            const currentValue = Math.min(progress?.currentValue ?? 0, item.target);
            const state = unlock
                ? 'unlocked'
                : currentValue > 0
                    ? 'in_progress'
                    : 'locked';

            const summaryItem = {
                achievementId: item.achievementId,
                title: item.title,
                description: item.description,
                state,
                currentValue,
                target: item.target,
                ...(unlock ? { unlockedAt: unlock.unlockedAt } : {}),
                isNew: Boolean(unlock && !unlock.seenAt)
            };
            items.push(summaryItem);
        }

        return {
            status: 'available',
            persistenceStatus,
            newUnlockCount: items.filter((item) => item.isNew).length,
            items,
            generatedAt: now().toISOString()
        };
    };

    const getAchievementSummary = async (lineUserId) => {
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
            storageFailure = error;
            return buildUnavailableSummary(getPersistenceStatus());
        }
    };

    const updatePlayerProgress = async (lineUserId, won, completedAt) => {
        const updates = [];
        for (const item of ACHIEVEMENT_CATALOG) {
            const existing = await getProgress(lineUserId, item.achievementId);
            const increment = item.conditionType === 'completed_games' || (item.conditionType === 'wins' && won) ? 1 : 0;
            const currentValue = (existing?.currentValue ?? 0) + increment;
            const nextProgress = {
                lineUserId,
                achievementId: item.achievementId,
                currentValue,
                target: item.target,
                updatedAt: completedAt
            };
            await setProgress(nextProgress);

            const existingUnlock = await getUnlock(lineUserId, item.achievementId);
            if (!existingUnlock && currentValue >= item.target) {
                await setUnlock({
                    lineUserId,
                    achievementId: item.achievementId,
                    unlockedAt: completedAt
                });
            }
            updates.push(nextProgress);
        }
        return updates;
    };

    const recordMatchCompletion = async ({ completionId, completedAt = now().toISOString(), winner, players = [] } = {}) => {
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
            storageFailure = error;
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus: getPersistenceStatus()
            };
        }

        try {
            const updates = [];
            const affectedLineUserIds = [];
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
            storageFailure = error;
            return {
                status: 'unavailable',
                updates: [],
                persistenceStatus: getPersistenceStatus()
            };
        }
    };

    const acknowledgeNewUnlocks = async (lineUserId, achievementIds = []) => {
        const { available, persistenceStatus } = getDurableStatus();
        if (!lineUserId) {
            return buildGuestSummary(persistenceStatus);
        }
        if (!available) {
            return buildUnavailableSummary(persistenceStatus);
        }

        try {
            const allowedIds = new Set(ACHIEVEMENT_CATALOG.map((item) => item.achievementId));
            for (const achievementId of achievementIds) {
                if (!allowedIds.has(achievementId)) {
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
            storageFailure = error;
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
