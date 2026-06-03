import type {
    AccountPersistenceStatus,
    AccountSyncResult,
    AchievementStatusResult,
    LineAccountProfile
} from '@newhandarky/hanakoji-game-types';

interface ResponseSocketLike {
    send: (payload: string) => void;
}

export const buildAccountStatusResult = (
    profile: LineAccountProfile | null,
    persistenceStatus: AccountPersistenceStatus
): AccountSyncResult => ({
    status: profile ? 'bound' : 'guest',
    ...(profile ? { profile } : {}),
    persistenceStatus
});

export const sendAccountSyncResult = (
    ws: ResponseSocketLike,
    payload: AccountSyncResult
): void => {
    ws.send(JSON.stringify({
        type: 'ACCOUNT_SYNC_RESULT',
        payload
    }));
};

export const sendAchievementStatusResult = (
    ws: ResponseSocketLike,
    payload: AchievementStatusResult
): void => {
    ws.send(JSON.stringify({
        type: 'ACHIEVEMENT_STATUS_RESULT',
        payload
    }));
};
