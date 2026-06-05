import type {
    AccountPersistenceStatus,
    AccountSyncRequest,
    AccountSyncResult,
    LineAccountProfile
} from '@newhandarky/hanakoji-game-types';
import { backendLogger } from './runtimeLogger.js';
import {
    createAchievementStore,
    type AchievementMatchCompletionRequest,
    type AchievementMatchCompletionResult,
    type AchievementStore
} from './achievementStore.js';
import {
    createJsonPersistenceAdapter,
    type KeyValueClient
} from './persistenceAdapter.js';
import {
    buildPublicAccountProfile,
    createAccountProfileStore,
    validateVerifiedLineIdentity,
    type AccountCounterUpdateRequest
} from './accountProfileStore.js';
import {
    recordAccountMatchCompletion,
    type AccountCompletionRecord,
    type AccountMatchCompletionRequest,
    type AccountMatchCompletionResult
} from './accountCompletionRuntime.js';

export {
    buildPublicAccountProfile,
    validateVerifiedLineIdentity
} from './accountProfileStore.js';

const REDIS_URL = process.env.REDIS_URL;
const ACCOUNT_KEY_PREFIX = 'hanamikoji:account:line:';
const ACCOUNT_COMPLETION_KEY_PREFIX = 'hanamikoji:account:completion:';
const ACCOUNT_GUEST_NOTICE = '目前以訪客模式繼續，帳號進度暫時不會保存。';

interface AccountStoreOptions {
    redisUrl?: string;
    redisClient?: KeyValueClient | null;
    now?: () => Date;
    achievementStore?: AchievementStoreLike | null;
}

interface AccountSyncOptions {
    trustedIdentity?: boolean;
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

const buildAccountCompletionKey = (completionId: string) => `${ACCOUNT_COMPLETION_KEY_PREFIX}${completionId}`;

export const createAccountStore = ({
    redisUrl = REDIS_URL,
    redisClient = null,
    now = () => new Date(),
    achievementStore = null
}: AccountStoreOptions = {}): AccountStore => {
    const persistence = createJsonPersistenceAdapter({
        redisUrl,
        redisClient,
        logLabel: 'Account',
        durableMessage: 'Account profiles are persistent.',
        temporaryMessage: 'Account profiles are temporary in this environment.',
        unavailableMessage: 'Account profiles are unavailable; durable persistence is not connected.'
    });
    const getPersistenceStatus = persistence.getPersistenceStatus;
    const checkPersistenceStatus = persistence.checkConnection;

    const fallbackAchievementStore = createAchievementStore({
        redisUrl,
        redisClient,
        now,
        getPersistenceStatus
    });
    const activeAchievementStore = achievementStore ?? fallbackAchievementStore;
    const profileStore = createAccountProfileStore({
        persistence,
        accountKeyPrefix: ACCOUNT_KEY_PREFIX,
        guestNotice: ACCOUNT_GUEST_NOTICE,
        now
    });

    const readProcessedCompletion = async (completionId: string): Promise<AccountCompletionRecord | null> => {
        return persistence.getJson<AccountCompletionRecord>(buildAccountCompletionKey(completionId));
    };

    const writeProcessedCompletion = async (record: AccountCompletionRecord): Promise<void> => {
        await persistence.setJson(buildAccountCompletionKey(record.completionId), record);
    };

    const syncVerifiedAccount = async (request: AccountSyncRequest = {}): Promise<AccountSyncResult> => {
        try {
            return await profileStore.upsertProfile({
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

    const recordMatchCompletion = async (request: AccountMatchCompletionRequest = {}): Promise<AccountMatchCompletionResult> => (
        recordAccountMatchCompletion({
            request,
            now,
            getPersistenceStatus,
            readProcessedCompletion,
            writeProcessedCompletion,
            updateCountersForCompletedGame: profileStore.updateCountersForCompletedGame,
            achievementStore: activeAchievementStore
        })
    );

    return {
        getPersistenceStatus,
        checkPersistenceStatus,
        syncAccount,
        syncVerifiedAccount,
        upsertProfile: profileStore.upsertProfile,
        getProfile: profileStore.getProfile,
        updateCountersForCompletedGame: profileStore.updateCountersForCompletedGame,
        recordMatchCompletion,
        buildPublicAccountProfile,
        getAchievementSummary: activeAchievementStore.getAchievementSummary ?? fallbackAchievementStore.getAchievementSummary,
        acknowledgeNewUnlocks: activeAchievementStore.acknowledgeNewUnlocks ?? fallbackAchievementStore.acknowledgeNewUnlocks
    };
};

export const accountStore = createAccountStore();
