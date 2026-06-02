import type {
    AccountSyncRequest,
    AccountSyncResult,
    LineAccountProfile,
    MinimalAccountCounters,
    VerifiedLineIdentity
} from '@newhandarky/hanakoji-game-types';
import type { JsonPersistenceAdapter } from './persistenceAdapter.js';

interface AccountProfileStoreOptions {
    persistence: Pick<JsonPersistenceAdapter, 'getJson' | 'setJson' | 'getPersistenceStatus'>;
    accountKeyPrefix: string;
    guestNotice: string;
    now?: () => Date;
}

interface NormalizedAccountProfileInput {
    displayName: string;
    avatarUrl?: string;
}

export interface AccountCounterUpdateRequest {
    lineUserId?: string | null;
    won?: boolean;
    completedAt?: string;
}

export interface AccountProfileStore {
    upsertProfile: (request: Pick<AccountSyncRequest, 'verifiedIdentity' | 'profile'>) => Promise<AccountSyncResult>;
    getProfile: (lineUserId: string) => Promise<LineAccountProfile | undefined>;
    updateCountersForCompletedGame: (request?: AccountCounterUpdateRequest) => Promise<LineAccountProfile | null>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null
);

export const sanitizeString = (value: unknown): string | undefined => (
    typeof value === 'string' && value.trim() ? value.trim() : undefined
);

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

export const createAccountProfileStore = ({
    persistence,
    accountKeyPrefix,
    guestNotice,
    now = () => new Date()
}: AccountProfileStoreOptions): AccountProfileStore => {
    const buildAccountKey = (lineUserId: string) => `${accountKeyPrefix}${lineUserId}`;

    const readProfile = async (lineUserId: string): Promise<LineAccountProfile | null> => {
        return persistence.getJson<LineAccountProfile>(buildAccountKey(lineUserId));
    };

    const writeProfile = async (profile: LineAccountProfile): Promise<void> => {
        await persistence.setJson(buildAccountKey(profile.lineUserId), profile);
    };

    const upsertProfile = async ({ verifiedIdentity, profile }: Pick<AccountSyncRequest, 'verifiedIdentity' | 'profile'>): Promise<AccountSyncResult> => {
        const identity = validateVerifiedLineIdentity(verifiedIdentity);
        if (!identity) {
            return {
                status: 'unverified',
                guestNotice,
                persistenceStatus: persistence.getPersistenceStatus()
            };
        }

        const normalizedProfile = normalizeProfileInput(profile, identity.lineUserId);
        if (!normalizedProfile) {
            return {
                status: 'sync-failed',
                guestNotice,
                persistenceStatus: persistence.getPersistenceStatus()
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
            counters: existing?.counters ?? createDefaultCounters()
        };

        await writeProfile(nextProfile);

        return {
            status: 'bound',
            profile: buildPublicAccountProfile(nextProfile),
            persistenceStatus: persistence.getPersistenceStatus()
        };
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

    return {
        upsertProfile,
        getProfile: async (lineUserId: string) => buildPublicAccountProfile(await readProfile(lineUserId)),
        updateCountersForCompletedGame
    };
};
