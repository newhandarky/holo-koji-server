import type {
    AccountPersistenceStatus,
    LineAccountProfile
} from '@newhandarky/hanakoji-game-types';
import type {
    AchievementMatchCompletionRequest,
    AchievementMatchCompletionResult,
    AchievementStore
} from './achievementStore.js';
import {
    sanitizeString,
    type AccountCounterUpdateRequest
} from './accountProfileStore.js';

export interface AccountCompletionRecord {
    completionId: string;
    processedAt: string;
    affectedLineUserIds: string[];
}

export interface MatchCompletionPlayer {
    playerId: string;
    accountProfile?: Pick<LineAccountProfile, 'lineUserId'> | null;
    [key: string]: unknown;
}

export interface AccountMatchCompletionRequest {
    completionId?: string | null;
    players?: MatchCompletionPlayer[];
    winner?: string;
}

export interface AccountMatchCompletionResult {
    accountProfiles: LineAccountProfile[];
    achievements: AchievementMatchCompletionResult;
}

type AccountCompletionRuntimeOptions = {
    request?: AccountMatchCompletionRequest;
    now: () => Date;
    getPersistenceStatus: () => AccountPersistenceStatus;
    readProcessedCompletion: (completionId: string) => Promise<AccountCompletionRecord | null>;
    writeProcessedCompletion: (record: AccountCompletionRecord) => Promise<void>;
    updateCountersForCompletedGame: (request?: AccountCounterUpdateRequest) => Promise<LineAccountProfile | null>;
    achievementStore: Pick<AchievementStore, 'recordMatchCompletion'>;
};

const buildDuplicateAchievementResult = (
    completionId: string,
    persistenceStatus: AccountPersistenceStatus
): AchievementMatchCompletionResult => {
    const achievementStatus = persistenceStatus.mode === 'durable' && persistenceStatus.available === true
        ? 'available'
        : 'unavailable';

    return {
        status: achievementStatus,
        updates: [],
        persistenceStatus,
        completionId
    };
};

export const recordAccountMatchCompletion = async ({
    request = {},
    now,
    getPersistenceStatus,
    readProcessedCompletion,
    writeProcessedCompletion,
    updateCountersForCompletedGame,
    achievementStore
}: AccountCompletionRuntimeOptions): Promise<AccountMatchCompletionResult> => {
    const {
        completionId,
        players = [],
        winner
    } = request;
    const completedAt = now().toISOString();
    const normalizedCompletionId = sanitizeString(completionId);
    if (!normalizedCompletionId) {
        const achievementResult = await achievementStore.recordMatchCompletion({
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
        return {
            accountProfiles: [],
            achievements: buildDuplicateAchievementResult(normalizedCompletionId, getPersistenceStatus())
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
    const achievementResult = await achievementStore.recordMatchCompletion({
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
