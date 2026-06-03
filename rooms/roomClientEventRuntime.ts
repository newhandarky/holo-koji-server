import type { GeishaSet } from '@newhandarky/hanakoji-game-types';
import { DEFAULT_GEISHA_SET } from '../game/geishaSetCatalog.js';
import type { ServerGameState } from '../game/serverGameStateTypes.js';
import type { RoomSeat } from '../utils/roomSession.js';
import type { DealSequenceStep } from '../game/roundPreparation.js';
import {
    broadcastRoomMessage,
    buildMaskedDealSequence,
    buildPendingInteractionMessages,
    buildViewerGameState,
    sendRoomMessage,
    type WireMessage
} from './roomMessaging.js';

export type RoomClientEventRuntime = {
    roomId: string;
    players: RoomSeat[];
    geishaSet: GeishaSet;
    gameState: ServerGameState | null;
    dealSequence: DealSequenceStep[];
    persistRoomSnapshot: () => void;
};

export const sendRoomClientMessage = (
    room: Pick<RoomClientEventRuntime, 'roomId' | 'players'>,
    playerId: string,
    message: WireMessage
): void => {
    sendRoomMessage(room.roomId, room.players, playerId, message);
};

export const sendRoomClientError = (
    room: Pick<RoomClientEventRuntime, 'roomId' | 'players'>,
    playerId: string,
    message: string,
    code?: string
): void => {
    sendRoomClientMessage(room, playerId, {
        type: 'ERROR',
        payload: {
            message,
            ...(code ? { code } : {})
        }
    });
};

export const sendRoomPendingInteractionState = (
    room: Pick<RoomClientEventRuntime, 'roomId' | 'players' | 'gameState'>
): void => {
    const pendingInteraction = room.gameState?.pendingInteraction;
    if (!pendingInteraction) {
        return;
    }

    buildPendingInteractionMessages(room.players, pendingInteraction).forEach(({ playerId, message }) => {
        sendRoomClientMessage(room, playerId, message);
    });
};

export const buildRoomClientGameState = (
    room: Pick<RoomClientEventRuntime, 'gameState' | 'geishaSet'>,
    viewerId: string
): ServerGameState | null => {
    if (!room.gameState) {
        return null;
    }

    const visibleState = buildViewerGameState(room.gameState, viewerId, room.geishaSet ?? DEFAULT_GEISHA_SET);
    if (visibleState?.geishaSet && !room.gameState.geishaSet) {
        room.gameState.geishaSet = visibleState.geishaSet;
    }
    return visibleState;
};

export const buildRoomDealSequenceForPlayer = (
    room: Pick<RoomClientEventRuntime, 'dealSequence'>,
    playerId: string
): DealSequenceStep[] => buildMaskedDealSequence(room.dealSequence, playerId);

export const broadcastRoomClientMessage = (
    room: Pick<RoomClientEventRuntime, 'roomId' | 'players'>,
    message: WireMessage,
    excludePlayerId: string | null = null
): void => {
    broadcastRoomMessage(room.roomId, room.players, message, excludePlayerId);
};

export const broadcastRoomGameStateEvent = (
    room: RoomClientEventRuntime,
    eventType: string
): void => {
    if (!room.gameState) {
        return;
    }

    room.players.forEach((player) => {
        const payload = buildRoomClientGameState(room, player.playerId);
        if (payload) {
            sendRoomClientMessage(room, player.playerId, {
                type: eventType,
                payload
            });
        }
    });

    room.persistRoomSnapshot();
};

export const broadcastRoomGameState = (room: RoomClientEventRuntime): void => {
    broadcastRoomGameStateEvent(room, 'GAME_STATE_UPDATED');
};
