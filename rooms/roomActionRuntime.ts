import type { ActionType } from '@newhandarky/hanakoji-game-types';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    getPendingInteractionError,
    toCompetitionGroups,
    toStringArray,
    type ServerAction
} from '../game/actionValidation.js';
import {
    applySecretAction,
    applyTradeOffAction
} from '../game/activeActionTransitions.js';
import {
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from '../game/interactionActionTransitions.js';
import type { WireMessage } from './roomMessaging.js';

type GamePlayer = ServerGameState['players'][number];

export type RoomActionRuntime = {
    roomId: string;
    gameState: ServerGameState | null;
    players: Array<{ playerId: string }>;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    sendError: (playerId: string, message: string, code?: string) => void;
    validatePlayerInRoom: (playerId: string) => boolean;
    validatePlayerTurn: (playerId: string) => boolean;
    validateActionAvailable: (player: GamePlayer, actionType: ActionType) => boolean;
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

    if (!room.validatePlayerInRoom(playerId)) {
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

    if (room.gameState.phase !== 'playing' && !action.type.startsWith('RESOLVE_')) {
        room.sendError(playerId, '目前無法執行行動');
        return;
    }

    switch (action.type) {
        case 'PLAY_SECRET':
            if (!room.validatePlayerTurn(playerId) || !room.validateActionAvailable(player, 'secret')) {
                return;
            }
            handleRoomPlaySecret(room, player, typeof action.payload?.cardId === 'string' ? action.payload.cardId : undefined);
            break;
        case 'PLAY_TRADE_OFF':
            if (!room.validatePlayerTurn(playerId) || !room.validateActionAvailable(player, 'trade-off')) {
                return;
            }
            handleRoomTradeOff(room, player, toStringArray(action.payload?.cardIds));
            break;
        case 'INITIATE_GIFT':
            if (!room.validatePlayerTurn(playerId) || !room.validateActionAvailable(player, 'gift')) {
                return;
            }
            handleRoomInitiateGift(room, player, toStringArray(action.payload?.cardIds));
            break;
        case 'RESOLVE_GIFT':
            handleRoomResolveGift(room, playerId, typeof action.payload?.chosenCardId === 'string' ? action.payload.chosenCardId : undefined);
            break;
        case 'INITIATE_COMPETITION':
            if (!room.validatePlayerTurn(playerId) || !room.validateActionAvailable(player, 'competition')) {
                return;
            }
            handleRoomInitiateCompetition(room, player, toCompetitionGroups(action.payload?.groups));
            break;
        case 'RESOLVE_COMPETITION':
            handleRoomResolveCompetition(room, playerId, typeof action.payload?.chosenGroupIndex === 'number' ? action.payload.chosenGroupIndex : undefined);
            break;
        default:
            backendLogger.warn('⚠️ 未實作的行動類型', {
                roomId: room.roomId,
                playerId,
                actionType: action.type
            });
    }
};

export const handleRoomPlaySecret = (
    room: RoomActionRuntime,
    player: GamePlayer,
    cardId?: string
): void => {
    const result = applySecretAction(player, cardId, room.gameState?.openingDeal);
    if (!result.ok) {
        backendLogger.warn('⚠️ PLAY_SECRET 驗證失敗', {
            roomId: room.roomId,
            playerId: player.id,
            error: result.errorMessage
        });
        room.sendError(player.id, result.errorMessage);
        return;
    }

    const { player: updatedPlayer, openingDeal, revealedCardIds } = result.value;
    if (room.gameState) {
        room.gameState.players = room.gameState.players.map(item => item.id === updatedPlayer.id ? updatedPlayer : item);
        room.gameState.openingDeal = openingDeal;
        room.gameState.lastAction = { playerId: updatedPlayer.id, action: 'secret' };
    }

    room.players.forEach((recipient) => {
        const shouldReveal = recipient.playerId === updatedPlayer.id;
        room.sendToPlayer(recipient.playerId, {
            type: 'ACTION_EXECUTED',
            payload: {
                playerId: updatedPlayer.id,
                action: 'secret',
                cardIds: shouldReveal ? revealedCardIds : []
            }
        });
    });

    room.broadcastGameState();
    room.endTurn();
};

export const handleRoomTradeOff = (
    room: RoomActionRuntime,
    player: GamePlayer,
    cardIds: string[] = []
): void => {
    const result = applyTradeOffAction(player, cardIds, room.gameState?.openingDeal);
    if (!result.ok) {
        backendLogger.warn('⚠️ PLAY_TRADE_OFF 驗證失敗', {
            roomId: room.roomId,
            playerId: player.id,
            error: result.errorMessage
        });
        room.sendError(player.id, result.errorMessage);
        return;
    }

    const { player: updatedPlayer, openingDeal, revealedCardIds } = result.value;
    if (room.gameState) {
        room.gameState.players = room.gameState.players.map(item => item.id === updatedPlayer.id ? updatedPlayer : item);
        room.gameState.openingDeal = openingDeal;
        room.gameState.lastAction = { playerId: updatedPlayer.id, action: 'trade-off' };
    }

    room.players.forEach((recipient) => {
        const shouldReveal = recipient.playerId === updatedPlayer.id;
        room.sendToPlayer(recipient.playerId, {
            type: 'ACTION_EXECUTED',
            payload: {
                playerId: updatedPlayer.id,
                action: 'trade-off',
                cardIds: shouldReveal ? revealedCardIds : []
            }
        });
    });

    room.broadcastGameState();
    room.endTurn();
};

export const handleRoomInitiateGift = (
    room: RoomActionRuntime,
    player: GamePlayer,
    cardIds: string[] = []
): void => {
    const opponentId = room.getOpponentId(player.id);
    const result = initiateGiftAction(player, opponentId, cardIds, room.gameState?.openingDeal);
    if (!result.ok) {
        backendLogger.warn('⚠️ INITIATE_GIFT 驗證失敗', {
            roomId: room.roomId,
            playerId: player.id,
            error: result.errorMessage
        });
        room.sendError(player.id, result.errorMessage);
        return;
    }

    if (!room.gameState) {
        return;
    }
    room.gameState.players = room.gameState.players.map(item => item.id === result.value.player.id ? result.value.player : item);
    room.gameState.openingDeal = result.value.openingDeal;
    room.gameState.pendingInteraction = result.value.pendingInteraction;
    room.gameState.lastAction = { playerId: result.value.player.id, action: 'gift' };

    room.sendPendingInteractionState();
    room.broadcastGameState();

    if (room.isNpcPlayerId(result.value.pendingInteraction.targetPlayerId)) {
        room.scheduleNpcResponse();
    }
};

export const handleRoomResolveGift = (
    room: RoomActionRuntime,
    playerId: string,
    chosenCardId?: string
): void => {
    const result = resolveGiftAction(
        room.gameState?.players ?? [],
        room.gameState?.pendingInteraction,
        playerId,
        chosenCardId
    );
    if (!result.ok) {
        backendLogger.warn('⚠️ RESOLVE_GIFT 驗證失敗', {
            roomId: room.roomId,
            playerId,
            error: result.errorMessage
        });
        room.sendError(playerId, result.errorMessage);
        return;
    }

    if (room.gameState) {
        room.gameState.players = result.value.players;
        room.gameState.pendingInteraction = result.value.pendingInteraction;
    }

    room.broadcast({
        type: 'INTERACTION_RESOLVED',
        payload: {
            interaction: 'GIFT_SELECTION',
            initiatorId: result.value.initiatorId,
            targetPlayerId: result.value.targetPlayerId,
            chosenCardId: result.value.chosenCardId
        }
    });

    room.broadcastGameState();
    room.endTurn();
};

export const handleRoomInitiateCompetition = (
    room: RoomActionRuntime,
    player: GamePlayer,
    groups: string[][] = []
): void => {
    const opponentId = room.getOpponentId(player.id);
    const result = initiateCompetitionAction(player, opponentId, groups, room.gameState?.openingDeal);
    if (!result.ok) {
        backendLogger.warn('⚠️ INITIATE_COMPETITION 驗證失敗', {
            roomId: room.roomId,
            playerId: player.id,
            error: result.errorMessage
        });
        room.sendError(player.id, result.errorMessage);
        return;
    }

    if (!room.gameState) {
        return;
    }
    room.gameState.players = room.gameState.players.map(item => item.id === result.value.player.id ? result.value.player : item);
    room.gameState.openingDeal = result.value.openingDeal;
    room.gameState.pendingInteraction = result.value.pendingInteraction;
    room.gameState.lastAction = { playerId: result.value.player.id, action: 'competition' };

    room.sendPendingInteractionState();
    room.broadcastGameState();

    if (room.isNpcPlayerId(result.value.pendingInteraction.targetPlayerId)) {
        room.scheduleNpcResponse();
    }
};

export const handleRoomResolveCompetition = (
    room: RoomActionRuntime,
    playerId: string,
    chosenGroupIndex?: number
): void => {
    const result = resolveCompetitionAction(
        room.gameState?.players ?? [],
        room.gameState?.pendingInteraction,
        playerId,
        chosenGroupIndex
    );
    if (!result.ok) {
        backendLogger.warn('⚠️ RESOLVE_COMPETITION 驗證失敗', {
            roomId: room.roomId,
            playerId,
            error: result.errorMessage
        });
        room.sendError(playerId, result.errorMessage);
        return;
    }

    if (room.gameState) {
        room.gameState.players = result.value.players;
        room.gameState.pendingInteraction = result.value.pendingInteraction;
    }

    room.broadcast({
        type: 'INTERACTION_RESOLVED',
        payload: {
            interaction: 'COMPETITION_SELECTION',
            initiatorId: result.value.initiatorId,
            targetPlayerId: result.value.targetPlayerId,
            chosenGroupIndex: result.value.chosenGroupIndex
        }
    });

    room.broadcastGameState();
    room.endTurn();
};
