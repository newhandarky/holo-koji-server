import type { LineAccountProfile } from '@newhandarky/hanakoji-game-types';
import type { WebSocketConnectionContext } from './connectionContext.js';

export interface AccountBindingRoomLike {
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

const applyProfileToSeat = (
    player: AccountBindingRoomLike['players'][number],
    profile: LineAccountProfile
): void => {
    player.accountProfile = profile;
    player.lineUserId = profile.lineUserId;
    player.avatarUrl = profile.avatarUrl;
};

const applyProfileToGameState = (
    room: AccountBindingRoomLike,
    playerId: string,
    profile: LineAccountProfile
): boolean => {
    const statePlayer = room.gameState?.players.find((item) => item.id === playerId);
    if (!statePlayer) {
        return false;
    }
    statePlayer.lineUserId = profile.lineUserId;
    statePlayer.avatarUrl = profile.avatarUrl;
    return true;
};

export const applyBoundAccountProfileToCurrentRoom = <TRoom extends AccountBindingRoomLike>(
    context: WebSocketConnectionContext,
    rooms: Map<string, TRoom>
): boolean => {
    if (!context.currentRoomId || !context.currentPlayerId || !context.currentAccountProfile) {
        return false;
    }

    const room = rooms.get(context.currentRoomId);
    const player = room?.players.find((item) => item.playerId === context.currentPlayerId);
    if (!room || !player) {
        return false;
    }

    applyProfileToSeat(player, context.currentAccountProfile);
    if (room.gameState && applyProfileToGameState(room, context.currentPlayerId, context.currentAccountProfile)) {
        room.broadcastGameState();
    }
    room.persistRoomSnapshot();
    return true;
};
