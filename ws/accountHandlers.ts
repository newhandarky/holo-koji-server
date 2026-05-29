import type { WebSocket } from 'ws';
import type {
    AccountSyncRequest,
    AchievementAcknowledgeRequest
} from '@newhandarky/hanakoji-game-types';
import type { AccountStore } from '../utils/accountStore.js';
import type { WebSocketConnectionContext } from './connectionContext.js';

type JsonObject = Record<string, unknown>;

export interface AccountHandlerRoomLike {
    players: Array<{
        playerId: string;
        accountProfile?: WebSocketConnectionContext['currentAccountProfile'];
        lineUserId?: string;
        avatarUrl?: string;
    }>;
    gameState: {
        players: Array<{
            id: string;
            lineUserId?: string;
            avatarUrl?: string;
        }>;
    } | null;
    broadcastGameState: () => void;
    persistRoomSnapshot: () => void;
}

export interface AccountHandlerDependencies<TRoom extends AccountHandlerRoomLike> {
    accountStore: AccountStore;
    resolveVerifiedLineAccountRequest: (payload?: AccountSyncRequest) => Promise<AccountSyncRequest | null>;
    rooms: Map<string, TRoom>;
}

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const handleAccountSync = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const accountSyncRequest = isRecord(payload) ? payload as AccountSyncRequest : {};
    const verifiedAccountRequest = await deps.resolveVerifiedLineAccountRequest(accountSyncRequest);
    const syncResult = verifiedAccountRequest
        ? await deps.accountStore.syncAccount(verifiedAccountRequest, { trustedIdentity: true })
        : await deps.accountStore.syncAccount(accountSyncRequest);
    context.currentAccountProfile = syncResult.status === 'bound' && syncResult.profile ? syncResult.profile : null;

    if (context.currentRoomId && context.currentPlayerId && context.currentAccountProfile) {
        const room = deps.rooms.get(context.currentRoomId);
        const player = room?.players.find((item) => item.playerId === context.currentPlayerId);
        if (room && player) {
            player.accountProfile = context.currentAccountProfile;
            player.lineUserId = context.currentAccountProfile.lineUserId;
            player.avatarUrl = context.currentAccountProfile.avatarUrl;
            if (room.gameState) {
                const statePlayer = room.gameState.players.find((item) => item.id === context.currentPlayerId);
                if (statePlayer) {
                    statePlayer.lineUserId = context.currentAccountProfile.lineUserId;
                    statePlayer.avatarUrl = context.currentAccountProfile.avatarUrl;
                }
                room.broadcastGameState();
            }
            room.persistRoomSnapshot();
        }
    }

    ws.send(JSON.stringify({
        type: 'ACCOUNT_SYNC_RESULT',
        payload: syncResult
    }));
};

export const handleAccountStatus = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const persistenceStatus = await deps.accountStore.checkPersistenceStatus();
    ws.send(JSON.stringify({
        type: 'ACCOUNT_SYNC_RESULT',
        payload: {
            status: context.currentAccountProfile ? 'bound' : 'guest',
            ...(context.currentAccountProfile ? { profile: context.currentAccountProfile } : {}),
            persistenceStatus
        }
    }));
};

export const handleAchievementStatus = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const summary = await deps.accountStore.getAchievementSummary(context.currentAccountProfile?.lineUserId);
    ws.send(JSON.stringify({
        type: 'ACHIEVEMENT_STATUS_RESULT',
        payload: summary
    }));
};

export const handleAchievementAckNewUnlocks = async <TRoom extends AccountHandlerRoomLike>(
    ws: WebSocket,
    payload: unknown,
    context: WebSocketConnectionContext,
    deps: AccountHandlerDependencies<TRoom>
): Promise<void> => {
    const achievementRequest = isRecord(payload) ? payload as AchievementAcknowledgeRequest : {};
    const achievementIds = Array.isArray(achievementRequest.achievementIds)
        ? achievementRequest.achievementIds
        : [];
    const summary = await deps.accountStore.acknowledgeNewUnlocks(
        context.currentAccountProfile?.lineUserId,
        achievementIds
    );
    ws.send(JSON.stringify({
        type: 'ACHIEVEMENT_STATUS_RESULT',
        payload: summary
    }));
};
