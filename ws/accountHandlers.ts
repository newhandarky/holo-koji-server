import type { WebSocket } from 'ws';
import type {
    AccountSyncRequest,
} from '@newhandarky/hanakoji-game-types';
import type { AccountStore } from '../utils/accountStore.js';
import {
    normalizeAccountSyncPayload,
    normalizeAchievementAcknowledgePayload
} from './accountMessagePayloads.js';
import {
    buildAccountStatusResult,
    sendAccountSyncResult,
    sendAchievementStatusResult
} from './accountMessageResponses.js';
import {
    applyBoundAccountProfileToCurrentRoom,
    type AccountBindingRoomLike
} from './accountRoomBindingRuntime.js';
import type { WebSocketConnectionContext } from './connectionContext.js';

export type AccountHandlerRoomLike = AccountBindingRoomLike;

export interface AccountHandlerDependencies<TRoom extends AccountHandlerRoomLike> {
    accountStore: AccountStore;
    resolveVerifiedLineAccountRequest: (payload?: AccountSyncRequest) => Promise<AccountSyncRequest | null>;
    rooms: Map<string, TRoom>;
}

export const handleAccountSync = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const accountSyncRequest = normalizeAccountSyncPayload(payload);
    const verifiedAccountRequest = await deps.resolveVerifiedLineAccountRequest(accountSyncRequest);
    const syncResult = verifiedAccountRequest
        ? await deps.accountStore.syncAccount(verifiedAccountRequest, { trustedIdentity: true })
        : await deps.accountStore.syncAccount(accountSyncRequest);
    context.currentAccountProfile = syncResult.status === 'bound' && syncResult.profile ? syncResult.profile : null;

    applyBoundAccountProfileToCurrentRoom(context, deps.rooms);

    sendAccountSyncResult(ws, syncResult);
};

export const handleAccountStatus = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const persistenceStatus = await deps.accountStore.checkPersistenceStatus();
    sendAccountSyncResult(
        ws,
        buildAccountStatusResult(context.currentAccountProfile, persistenceStatus)
    );
};

export const handleAchievementStatus = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const summary = await deps.accountStore.getAchievementSummary(context.currentAccountProfile?.lineUserId);
    sendAchievementStatusResult(ws, summary);
};

export const handleAchievementAckNewUnlocks = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const achievementRequest = normalizeAchievementAcknowledgePayload(payload);
    const summary = await deps.accountStore.acknowledgeNewUnlocks(
        context.currentAccountProfile?.lineUserId,
        achievementRequest.achievementIds
    );
    sendAchievementStatusResult(ws, summary);
};
