import type { ServerGameState } from '../game/serverGameStateTypes.js';
import { backendLogger } from '../utils/runtimeLogger.js';
import {
    applySecretAction,
    applyTradeOffAction
} from '../game/activeActionTransitions.js';
import { publishRoomActiveActionResult } from './roomActionEvents.js';
import type { RoomActionRuntime } from './roomActionRuntime.js';

type GamePlayer = ServerGameState['players'][number];

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

    publishRoomActiveActionResult(room, {
        playerId: updatedPlayer.id,
        action: 'secret',
        revealedCardIds
    });
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

    publishRoomActiveActionResult(room, {
        playerId: updatedPlayer.id,
        action: 'trade-off',
        revealedCardIds
    });
};
