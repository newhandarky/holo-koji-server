import type { ActionType } from '@newhandarky/hanakoji-game-types';
import {
    getActionAvailabilityError
} from '../game/actionValidation.js';
import type { ServerGameState } from '../game/serverGameStateTypes.js';

type GamePlayer = ServerGameState['players'][number];

type RoomActionGuardRuntime = {
    sendError: (playerId: string, message: string, code?: string) => void;
};

export const validateRoomPlayerInRoom = (
    room: RoomActionGuardRuntime & { players: Array<{ playerId: string }> },
    playerId: string
): boolean => {
    if (!room.players.some(player => player.playerId === playerId)) {
        room.sendError(playerId, '玩家不在房間內');
        return false;
    }
    return true;
};

export const validateRoomPlayerTurn = (
    room: RoomActionGuardRuntime & { gameState: ServerGameState | null },
    playerId: string
): boolean => {
    if (!room.gameState) {
        room.sendError(playerId, '遊戲尚未開始');
        return false;
    }

    const currentPlayer = room.gameState.players[room.gameState.currentPlayer];
    if (!currentPlayer || currentPlayer.id !== playerId) {
        room.sendError(playerId, '不是你的回合');
        return false;
    }
    return true;
};

export const validateRoomActionAvailable = (
    room: RoomActionGuardRuntime,
    player: GamePlayer,
    actionType: ActionType
): boolean => {
    const errorMessage = getActionAvailabilityError(player, actionType);
    if (errorMessage) {
        room.sendError(player.id, errorMessage);
        return false;
    }
    return true;
};
