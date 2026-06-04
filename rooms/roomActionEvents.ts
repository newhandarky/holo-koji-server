import type { ActionType } from '@newhandarky/hanakoji-game-types';
import type { WireMessage } from './roomMessaging.js';

type RoomActionEventRuntime = {
    players: Array<{ playerId: string }>;
    sendToPlayer: (playerId: string, message: WireMessage) => void;
    broadcast: (message: WireMessage, excludePlayerId?: string | null) => void;
    broadcastGameState: () => void;
    endTurn: () => void;
};

type ActiveActionResult = {
    playerId: string;
    action: ActionType;
    revealedCardIds: string[];
};

type InteractionResolvedPayload =
    | {
        interaction: 'GIFT_SELECTION';
        initiatorId: string;
        targetPlayerId: string;
        chosenCardId?: string;
    }
    | {
        interaction: 'COMPETITION_SELECTION';
        initiatorId: string;
        targetPlayerId: string;
        chosenGroupIndex?: number;
    };

export const publishRoomActiveActionResult = (
    room: RoomActionEventRuntime,
    result: ActiveActionResult
): void => {
    room.players.forEach((recipient) => {
        const shouldReveal = recipient.playerId === result.playerId;
        room.sendToPlayer(recipient.playerId, {
            type: 'ACTION_EXECUTED',
            payload: {
                playerId: result.playerId,
                action: result.action,
                cardIds: shouldReveal ? result.revealedCardIds : []
            }
        });
    });

    room.broadcastGameState();
    room.endTurn();
};

export const publishRoomInteractionResolved = (
    room: RoomActionEventRuntime,
    payload: InteractionResolvedPayload
): void => {
    room.broadcast({
        type: 'INTERACTION_RESOLVED',
        payload
    });

    room.broadcastGameState();
    room.endTurn();
};
