import type { ServerGameState } from '../game/serverGameStateTypes.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    initiateCompetitionAction,
    initiateGiftAction,
    resolveCompetitionAction,
    resolveGiftAction
} from '../game/interactionActionTransitions.js';
import { publishRoomInteractionResolved } from './roomActionEvents.js';
import type { RoomActionRuntime } from './roomActionRuntime.js';

type GamePlayer = ServerGameState['players'][number];

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

    publishRoomInteractionResolved(room, {
        interaction: 'GIFT_SELECTION',
        initiatorId: result.value.initiatorId,
        targetPlayerId: result.value.targetPlayerId,
        chosenCardId: result.value.chosenCardId
    });
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

    publishRoomInteractionResolved(room, {
        interaction: 'COMPETITION_SELECTION',
        initiatorId: result.value.initiatorId,
        targetPlayerId: result.value.targetPlayerId,
        chosenGroupIndex: result.value.chosenGroupIndex
    });
};
