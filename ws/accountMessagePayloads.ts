import type {
    AccountSyncRequest,
    AchievementAcknowledgeRequest
} from '@newhandarky/hanakoji-game-types';

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const normalizeAccountSyncPayload = (payload: unknown): AccountSyncRequest => (
    isRecord(payload) ? payload as AccountSyncRequest : {}
);

export const normalizeAchievementAcknowledgePayload = (payload: unknown): AchievementAcknowledgeRequest => {
    const request = isRecord(payload) ? payload as AchievementAcknowledgeRequest : {};
    return {
        achievementIds: Array.isArray(request.achievementIds)
            ? request.achievementIds
            : []
    };
};
