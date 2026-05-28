import { createClient } from 'redis';
import type {
    AccountPersistenceStatus,
    AccountSyncRequest,
    AccountSyncResult,
    LineAccountProfile,
    MinimalAccountCounters,
    VerifiedLineIdentity
} from 'game-shared-types';
import { backendLogger } from './runtimeLogger.js';
import {
    createAchievementStore,
    type AchievementMatchCompletionRequest,
    type AchievementMatchCompletionResult,
    type AchievementStore
} from './achievementStore.js';

const REDIS_URL = process.env.REDIS_URL;
const ACCOUNT_KEY_PREFIX = 'hanamikoji:account:line:';
const ACCOUNT_COMPLETION_KEY_PREFIX = 'hanamikoji:account:completion:';
const ACCOUNT_GUEST_NOTICE = '目前以訪客模式繼續，帳號進度暫時不會保存。';

interface KeyValueClient {
    isOpen?: boolean;
    connect?: () => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<unknown>;
    on?: (event: 'error', listener: (error: unknown) => void) => unknown;
}

interface AccountStoreOptions {
    redisUrl?: string;
    redisClient?: KeyValueClient | null;
    now?: () => Date;
    achievementStore?: AchievementStoreLike | null;
}

interface AccountSyncOptions {
    trustedIdentity?: boolean;
}

interface AccountCompletionRecord {
    completionId: string;
    processedAt: string;
    affectedLineUserIds: string[];
}

interface MatchCompletionPlayer {
    playerId: string;
    accountProfile?: Pick<LineAccountProfile, 'lineUserId'> | null;
    [key: string]: unknown;
}

interface AccountMatchCompletionRequest {
    completionId?: string | null;
    players?: MatchCompletionPlayer[];
    winner?: string;
}

interface AccountCounterUpdateRequest {
    lineUserId?: string | null;
    won?: boolean;
    completedAt?: string;
}

interface NormalizedAccountProfileInput {
    displayName: string;
    avatarUrl?: string;
}

interface AccountMatchCompletionResult {
    accountProfiles: LineAccountProfile[];
    achievements: AchievementMatchCompletionResult;
}

type AchievementStoreLike = Pick<AchievementStore, 'recordMatchCompletion'> & Partial<Omit<AchievementStore, 'recordMatchCompletion'>>;

export interface AccountStore {
    getPersistenceStatus: () => AccountPersistenceStatus;
    checkPersistenceStatus: () => Promise<AccountPersistenceStatus>;
    syncAccount: (request?: AccountSyncRequest | Record<string, unknown>, options?: AccountSyncOptions) => Promise<AccountSyncResult>;
    syncVerifiedAccount: (request?: AccountSyncRequest) => Promise<AccountSyncResult>;
    upsertProfile: (request: Pick<AccountSyncRequest, 'verifiedIdentity' | 'profile'>) => Promise<AccountSyncResult>;
    getProfile: (lineUserId: string) => Promise<LineAccountProfile | undefined>;
    updateCountersForCompletedGame: (request?: AccountCounterUpdateRequest) => Promise<LineAccountProfile | null>;
    recordMatchCompletion: (request?: AccountMatchCompletionRequest) => Promise<AccountMatchCompletionResult>;
    buildPublicAccountProfile: (profile?: LineAccountProfile | null) => LineAccountProfile | undefined;
    getAchievementSummary: AchievementStore['getAchievementSummary'];
    acknowledgeNewUnlocks: AchievementStore['acknowledgeNewUnlocks'];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

const sanitizeString = (value: unknown): string | undefined => (
    typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const buildAccountKey = (lineUserId: string) => `${ACCOUNT_KEY_PREFIX}${lineUserId}`;
const buildAccountCompletionKey = (completionId: string) => `${ACCOUNT_COMPLETION_KEY_PREFIX}${completionId}`;

const createDefaultCounters = (): MinimalAccountCounters => ({
    gamesPlayed: 0,
    wins: 0,
    lastPlayedAt: null
});

export const validateVerifiedLineIdentity = (verifiedIdentity: unknown): VerifiedLineIdentity | null => {
    if (!isRecord(verifiedIdentity)) {
        return null;
    }

    const provider = verifiedIdentity.provider;
    const lineUserId = sanitizeString(verifiedIdentity.lineUserId);
    const source = sanitizeString(verifiedIdentity.source);
    const verifiedAt = sanitizeString(verifiedIdentity.verifiedAt);

    if (provider !== 'line' || !lineUserId || !source || !verifiedAt) {
        return null;
    }

    const parsedVerifiedAt = Date.parse(verifiedAt);
    if (Number.isNaN(parsedVerifiedAt)) {
        return null;
    }

    return {
        provider: 'line',
        lineUserId,
        verifiedAt: new Date(parsedVerifiedAt).toISOString(),
        source
    };
};

const normalizeProfileInput = (
    profile: AccountSyncRequest['profile'] = {},
    fallbackDisplayName = ''
): NormalizedAccountProfileInput | null => {
    const displayName = sanitizeString(profile?.displayName) ?? sanitizeString(fallbackDisplayName);
    if (!displayName) {
        return null;
    }

    const avatarUrl = sanitizeString(profile?.avatarUrl);
    return {
        displayName,
        ...(avatarUrl ? { avatarUrl } : {})
    };
};

export const buildPublicAccountProfile = (profile?: LineAccountProfile | null): LineAccountProfile | undefined => {
    if (!profile) {
        return undefined;
    }

    return {
        lineUserId: profile.lineUserId,
        displayName: profile.displayName,
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        counters: {
            gamesPlayed: profile.counters?.gamesPlayed ?? 0,
            wins: profile.counters?.wins ?? 0,
            lastPlayedAt: profile.counters?.lastPlayedAt ?? null
        }
    };
};

export const createAccountStore = ({
    redisUrl = REDIS_URL,
    redisClient = null,
    now = () => new Date(),
    achievementStore = null
}: AccountStoreOptions = {}): AccountStore => {
    const memoryProfiles = new Map<string, LineAccountProfile>();
    const memoryProcessedCompletions = new Map<string, AccountCompletionRecord>();
    let client = redisClient;
    let storageFailure: unknown = null;

    const getPersistenceStatus = (): AccountPersistenceStatus => {
        if (storageFailure) {
            return {
                mode: 'temporary',
                available: false,
                message: 'Account profiles are unavailable; durable persistence is not connected.'
            };
        }

        if (client?.isOpen === true) {
            return {
                mode: 'durable',
                available: true,
                message: 'Account profiles are persistent.'
            };
        }

        if (redisUrl || client) {
            return {
                mode: 'temporary',
                available: false,
                message: 'Account profiles are unavailable; durable persistence is not connected.'
            };
        }

        return {
            mode: 'temporary',
            available: true,
            message: 'Account profiles are temporary in this environment.'
        };
    };

    const getClient = async (): Promise<KeyValueClient | null> => {
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

        const nextClient = createClient({ url: redisUrl }) as unknown as KeyValueClient;
        nextClient.on?.('error', (error) => {
            backendLogger.error('❌ Account Redis 連線錯誤', {
                error: error instanceof Error ? error.message : 'unknown'
            });
        });

        if (!nextClient.isOpen) {
            try {
                await nextClient.connect?.();
                backendLogger.info('✅ Account Redis 連線成功');
            } catch (error) {
                storageFailure = error;
                client = null;
                throw error;
            }
        }
        client = nextClient;
        return client;
    };

    const checkPersistenceStatus = async (): Promise<AccountPersistenceStatus> => {
        if ((redisUrl || client) && client?.isOpen !== true && !storageFailure) {
            try {
                await getClient();
            } catch (_error) {
                // getClient records the failure; callers only need the public status.
            }
        }

        return getPersistenceStatus();
    };

    const fallbackAchievementStore = createAchievementStore({
        redisUrl,
        redisClient: client,
        now,
        getPersistenceStatus
    });
    const activeAchievementStore = achievementStore ?? fallbackAchievementStore;

    const readProfile = async (lineUserId: string): Promise<LineAccountProfile | null> => {
        const key = buildAccountKey(lineUserId);
        const activeClient = await getClient();
        if (activeClient) {
            try {
                const raw = await activeClient.get(key);
                return raw ? JSON.parse(raw) as LineAccountProfile : null;
            } catch (error) {
                storageFailure = error;
                throw error;
            }
        }
        return memoryProfiles.get(lineUserId) ?? null;
    };

    const writeProfile = async (profile: LineAccountProfile): Promise<void> => {
        const key = buildAccountKey(profile.lineUserId);
        const activeClient = await getClient();
        if (activeClient) {
            try {
                await activeClient.set(key, JSON.stringify(profile));
            } catch (error) {
                storageFailure = error;
                throw error;
            }
            return;
        }
        memoryProfiles.set(profile.lineUserId, profile);
    };

    const readProcessedCompletion = async (completionId: string): Promise<AccountCompletionRecord | null> => {
        const activeClient = await getClient();
        if (activeClient) {
            try {
                const raw = await activeClient.get(buildAccountCompletionKey(completionId));
                return raw ? JSON.parse(raw) as AccountCompletionRecord : null;
            } catch (error) {
                storageFailure = error;
                throw error;
            }
        }
        return memoryProcessedCompletions.get(completionId) ?? null;
    };

    const writeProcessedCompletion = async (record: AccountCompletionRecord): Promise<void> => {
        const activeClient = await getClient();
        if (activeClient) {
            try {
                await activeClient.set(buildAccountCompletionKey(record.completionId), JSON.stringify(record));
            } catch (error) {
                storageFailure = error;
                throw error;
            }
            return;
        }
        memoryProcessedCompletions.set(record.completionId, record);
    };

    const upsertProfile = async ({ verifiedIdentity, profile }: Pick<AccountSyncRequest, 'verifiedIdentity' | 'profile'>): Promise<AccountSyncResult> => {
        const identity = validateVerifiedLineIdentity(verifiedIdentity);
        if (!identity) {
            return {
                status: 'unverified',
                guestNotice: ACCOUNT_GUEST_NOTICE,
                persistenceStatus: getPersistenceStatus()
            };
        }

        const normalizedProfile = normalizeProfileInput(profile, identity.lineUserId);
        if (!normalizedProfile) {
            return {
                status: 'sync-failed',
                guestNotice: ACCOUNT_GUEST_NOTICE,
                persistenceStatus: getPersistenceStatus()
            };
        }

        const existing = await readProfile(identity.lineUserId);
        const timestamp = now().toISOString();
        const nextProfile: LineAccountProfile = {
            lineUserId: identity.lineUserId,
            displayName: normalizedProfile.displayName,
            ...(normalizedProfile.avatarUrl ? { avatarUrl: normalizedProfile.avatarUrl } : {}),
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
            counters: {
                gamesPlayed: existing?.counters?.gamesPlayed ?? 0,
                wins: existing?.counters?.wins ?? 0,
                lastPlayedAt: existing?.counters?.lastPlayedAt ?? null
            }
        };

        await writeProfile(nextProfile);

        return {
            status: 'bound',
            profile: buildPublicAccountProfile(nextProfile),
            persistenceStatus: getPersistenceStatus()
        };
    };

    const syncVerifiedAccount = async (request: AccountSyncRequest = {}): Promise<AccountSyncResult> => {
        try {
            return await upsertProfile({
                verifiedIdentity: request.verifiedIdentity,
                profile: request.profile
            });
        } catch (error) {
            backendLogger.error('❌ Account sync failed', {
                error: error instanceof Error ? error.message : 'unknown'
            });
            return {
                status: 'sync-failed',
                guestNotice: ACCOUNT_GUEST_NOTICE,
                persistenceStatus: getPersistenceStatus()
            };
        }
    };

    const syncAccount = async (_request: AccountSyncRequest | Record<string, unknown> = {}, options: AccountSyncOptions = {}): Promise<AccountSyncResult> => {
        if (!options.trustedIdentity) {
            return {
                status: 'unverified',
                guestNotice: ACCOUNT_GUEST_NOTICE,
                persistenceStatus: getPersistenceStatus()
            };
        }

        return syncVerifiedAccount(_request as AccountSyncRequest);
    };

    const updateCountersForCompletedGame = async ({
        lineUserId,
        won,
        completedAt = now().toISOString()
    }: AccountCounterUpdateRequest = {}): Promise<LineAccountProfile | null> => {
        const normalizedLineUserId = sanitizeString(lineUserId);
        if (!normalizedLineUserId) {
            return null;
        }

        const existing = await readProfile(normalizedLineUserId);
        if (!existing) {
            return null;
        }

        const gamesPlayed = (existing.counters?.gamesPlayed ?? 0) + 1;
        const wins = (existing.counters?.wins ?? 0) + (won ? 1 : 0);
        const nextProfile = {
            ...existing,
            updatedAt: now().toISOString(),
            counters: {
                gamesPlayed,
                wins: Math.min(wins, gamesPlayed),
                lastPlayedAt: completedAt
            }
        };

        await writeProfile(nextProfile);
        return buildPublicAccountProfile(nextProfile) ?? null;
    };

    const recordMatchCompletion = async ({
        completionId,
        players = [],
        winner
    }: AccountMatchCompletionRequest = {}): Promise<AccountMatchCompletionResult> => {
        const completedAt = now().toISOString();
        const normalizedCompletionId = sanitizeString(completionId);
        if (!normalizedCompletionId) {
            const achievementResult = await activeAchievementStore.recordMatchCompletion({
                completionId: normalizedCompletionId,
                completedAt,
                winner,
                players
            } satisfies AchievementMatchCompletionRequest);
            return {
                accountProfiles: [],
                achievements: achievementResult
            };
        }

        const existingCompletion = await readProcessedCompletion(normalizedCompletionId);
        if (existingCompletion) {
            const persistenceStatus = getPersistenceStatus();
            const achievementStatus = persistenceStatus.mode === 'durable' && persistenceStatus.available === true
                ? 'available'
                : 'unavailable';
            return {
                accountProfiles: [],
                achievements: {
                    status: achievementStatus,
                    updates: [],
                    persistenceStatus,
                    completionId: normalizedCompletionId
                }
            };
        }

        const updates: LineAccountProfile[] = [];
        const affectedLineUserIds: string[] = [];
        for (const player of players) {
            const lineUserId = player?.accountProfile?.lineUserId;
            if (!lineUserId) {
                continue;
            }
            const updated = await updateCountersForCompletedGame({
                lineUserId,
                won: player.playerId === winner,
                completedAt
            });
            if (updated) {
                updates.push(updated);
                affectedLineUserIds.push(updated.lineUserId);
            }
        }
        const achievementResult = await activeAchievementStore.recordMatchCompletion({
            completionId: normalizedCompletionId,
            completedAt,
            winner,
            players
        } satisfies AchievementMatchCompletionRequest);

        await writeProcessedCompletion({
            completionId: normalizedCompletionId,
            processedAt: now().toISOString(),
            affectedLineUserIds
        });

        return {
            accountProfiles: updates,
            achievements: achievementResult
        };
    };

    return {
        getPersistenceStatus,
        checkPersistenceStatus,
        syncAccount,
        syncVerifiedAccount,
        upsertProfile,
        getProfile: async (lineUserId: string) => buildPublicAccountProfile(await readProfile(lineUserId)),
        updateCountersForCompletedGame,
        recordMatchCompletion,
        buildPublicAccountProfile,
        getAchievementSummary: activeAchievementStore.getAchievementSummary ?? fallbackAchievementStore.getAchievementSummary,
        acknowledgeNewUnlocks: activeAchievementStore.acknowledgeNewUnlocks ?? fallbackAchievementStore.acknowledgeNewUnlocks
    };
};

export const accountStore = createAccountStore();
