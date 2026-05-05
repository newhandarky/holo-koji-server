import { createClient } from 'redis';
import { backendLogger } from './runtimeLogger.js';

const REDIS_URL = process.env.REDIS_URL;
const ACCOUNT_KEY_PREFIX = 'hanamikoji:account:line:';
const ACCOUNT_GUEST_NOTICE = '目前以訪客模式繼續，帳號進度暫時不會保存。';

const sanitizeString = (value) => (
    typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const buildAccountKey = (lineUserId) => `${ACCOUNT_KEY_PREFIX}${lineUserId}`;

const createDefaultCounters = () => ({
    gamesPlayed: 0,
    wins: 0,
    lastPlayedAt: null
});

export const validateVerifiedLineIdentity = (verifiedIdentity) => {
    if (!verifiedIdentity || typeof verifiedIdentity !== 'object') {
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

const normalizeProfileInput = (profile = {}, fallbackDisplayName = '') => {
    const displayName = sanitizeString(profile.displayName) ?? sanitizeString(fallbackDisplayName);
    if (!displayName) {
        return null;
    }

    const avatarUrl = sanitizeString(profile.avatarUrl);
    return {
        displayName,
        ...(avatarUrl ? { avatarUrl } : {})
    };
};

export const buildPublicAccountProfile = (profile) => {
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
    now = () => new Date()
} = {}) => {
    const memoryProfiles = new Map();
    let client = redisClient;
    let storageFailure = null;

    const getPersistenceStatus = () => {
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
            backendLogger.error('❌ Account Redis 連線錯誤', {
                error: error instanceof Error ? error.message : 'unknown'
            });
        });

        if (!client.isOpen) {
            try {
                await client.connect();
                backendLogger.info('✅ Account Redis 連線成功');
            } catch (error) {
                storageFailure = error;
                client = null;
                throw error;
            }
        }
        return client;
    };

    const checkPersistenceStatus = async () => {
        if ((redisUrl || client) && client?.isOpen !== true && !storageFailure) {
            try {
                await getClient();
            } catch (_error) {
                // getClient records the failure; callers only need the public status.
            }
        }

        return getPersistenceStatus();
    };

    const readProfile = async (lineUserId) => {
        const key = buildAccountKey(lineUserId);
        const activeClient = await getClient();
        if (activeClient) {
            try {
                const raw = await activeClient.get(key);
                return raw ? JSON.parse(raw) : null;
            } catch (error) {
                storageFailure = error;
                throw error;
            }
        }
        return memoryProfiles.get(lineUserId) ?? null;
    };

    const writeProfile = async (profile) => {
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

    const upsertProfile = async ({ verifiedIdentity, profile }) => {
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
        const nextProfile = {
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

    const syncVerifiedAccount = async (request = {}) => {
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

    const syncAccount = async (_request = {}, options = {}) => {
        if (!options.trustedIdentity) {
            return {
                status: 'unverified',
                guestNotice: ACCOUNT_GUEST_NOTICE,
                persistenceStatus: getPersistenceStatus()
            };
        }

        return syncVerifiedAccount(_request);
    };

    const updateCountersForCompletedGame = async ({ lineUserId, won, completedAt = now().toISOString() } = {}) => {
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
        return buildPublicAccountProfile(nextProfile);
    };

    const recordMatchCompletion = async ({ players = [], winner } = {}) => {
        const completedAt = now().toISOString();
        const updates = [];
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
            }
        }
        return updates;
    };

    return {
        getPersistenceStatus,
        checkPersistenceStatus,
        syncAccount,
        syncVerifiedAccount,
        upsertProfile,
        getProfile: async (lineUserId) => buildPublicAccountProfile(await readProfile(lineUserId)),
        updateCountersForCompletedGame,
        recordMatchCompletion,
        buildPublicAccountProfile
    };
};

export const accountStore = createAccountStore();
