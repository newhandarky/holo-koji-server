import type { ServerGameState } from '../game/serverGameStateTypes.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    getPendingInteractionError,
    type ServerAction
} from '../game/actionValidation.js';
import type { WireMessage } from './roomMessaging.js';
import {
    validateRoomActionAvailable,
    validateRoomPlayerInRoom,
    validateRoomPlayerTurn
} from './roomActionGuards.js';
import {
    resolveRoomActionDispatch
} from './roomActionDispatchRuntime.js';
import {
    handleRoomPlaySecret,
    handleRoomTradeOff
} from './roomActiveActionRuntime.js';
import {
    handleRoomInitiateCompetition,
    handleRoomInitiateGift,
    handleRoomResolveCompetition,
    handleRoomResolveGift
} from './roomInteractionActionRuntime.js';

type GamePlayer = ServerGameState['players'][number];

export type RoomActionRuntime = {
    roomId: string;
    gameState: ServerGameState | null;
    players: Array<{ playerId: string }>;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    sendError: (playerId: string, message: string, code?: string) => void;
    getPlayerState: (playerId: string) => GamePlayer | null;
    getOpponentId: (playerId: string) => string | null;
    sendPendingInteractionState: () => void;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    broadcastGameState: () => void;
    endTurn: () => void;
    isNpcPlayerId: (playerId: string) => boolean;
    scheduleNpcResponse: () => void;
};

export const validateRoomPendingInteraction = (
    room: Pick<RoomActionRuntime, 'gameState' | 'sendError'>,
    actionType: string,
    playerId: string
): boolean => {
    const errorMessage = getPendingInteractionError(room.gameState?.pendingInteraction, actionType);
    if (errorMessage) {
        room.sendError(playerId, errorMessage);
        return false;
    }

    return true;
};

export const handleRoomAction = (
    room: RoomActionRuntime,
    playerId: string,
    action: ServerAction
): void => {
    if (!room.gameState) {
        backendLogger.warn(`⚠️ 房間 ${room.roomId} 尚未建立遊戲狀態，無法處理行動`, {
            roomId: room.roomId,
            playerId
        });
        room.sendError(playerId, '遊戲尚未準備完成');
        return;
    }

    if (!validateRoomPlayerInRoom(room, playerId)) {
        return;
    }

    const player = room.getPlayerState(playerId);
    if (!player) {
        backendLogger.warn(`⚠️ 找不到玩家 ${playerId}，忽略行動`, {
            roomId: room.roomId,
            playerId,
            actionType: action?.type
        });
        room.sendError(playerId, '玩家資料不存在');
        return;
    }

    if (!validateRoomPendingInteraction(room, action.type, playerId)) {
        return;
    }

    const dispatch = resolveRoomActionDispatch(action);
    if (!dispatch) {
        backendLogger.warn('⚠️ 未實作的行動類型', {
            roomId: room.roomId,
            playerId,
            actionType: action.type
        });
        return;
    }

    if (room.gameState.phase !== 'playing' && dispatch.requiresTurn) {
        room.sendError(playerId, '目前無法執行行動');
        return;
    }

    if (
        dispatch.requiresTurn
        && (!validateRoomPlayerTurn(room, playerId) || !validateRoomActionAvailable(room, player, dispatch.actionToken))
    ) {
        return;
    }

    switch (dispatch.kind) {
        case 'play-secret':
            handleRoomPlaySecret(room, player, dispatch.cardId);
            break;
        case 'play-trade-off':
            handleRoomTradeOff(room, player, dispatch.cardIds);
            break;
        case 'initiate-gift':
            handleRoomInitiateGift(room, player, dispatch.cardIds);
            break;
        case 'resolve-gift':
            handleRoomResolveGift(room, playerId, dispatch.chosenCardId);
            break;
        case 'initiate-competition':
            handleRoomInitiateCompetition(room, player, dispatch.groups);
            break;
        case 'resolve-competition':
            handleRoomResolveCompetition(room, playerId, dispatch.chosenGroupIndex);
            break;
    }
};

export {
    handleRoomPlaySecret,
    handleRoomTradeOff
} from './roomActiveActionRuntime.js';
export {
    handleRoomInitiateCompetition,
    handleRoomInitiateGift,
    handleRoomResolveCompetition,
    handleRoomResolveGift
} from './roomInteractionActionRuntime.js';
