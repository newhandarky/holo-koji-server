import type { ActionType } from '@newhandarky/hanakoji-game-types';
import {
    toCompetitionGroups,
    toStringArray,
    type ServerAction
} from '../game/actionValidation.js';

export type RoomActionDispatch =
    | {
        kind: 'play-secret';
        requiresTurn: true;
        actionToken: ActionType;
        cardId?: string;
    }
    | {
        kind: 'play-trade-off';
        requiresTurn: true;
        actionToken: ActionType;
        cardIds: string[];
    }
    | {
        kind: 'initiate-gift';
        requiresTurn: true;
        actionToken: ActionType;
        cardIds: string[];
    }
    | {
        kind: 'resolve-gift';
        requiresTurn: false;
        chosenCardId?: string;
    }
    | {
        kind: 'initiate-competition';
        requiresTurn: true;
        actionToken: ActionType;
        groups: string[][];
    }
    | {
        kind: 'resolve-competition';
        requiresTurn: false;
        chosenGroupIndex?: number;
    };

export const resolveRoomActionDispatch = (action: ServerAction): RoomActionDispatch | null => {
    switch (action.type) {
        case 'PLAY_SECRET':
            return {
                kind: 'play-secret',
                requiresTurn: true,
                actionToken: 'secret',
                cardId: typeof action.payload?.cardId === 'string' ? action.payload.cardId : undefined
            };
        case 'PLAY_TRADE_OFF':
            return {
                kind: 'play-trade-off',
                requiresTurn: true,
                actionToken: 'trade-off',
                cardIds: toStringArray(action.payload?.cardIds)
            };
        case 'INITIATE_GIFT':
            return {
                kind: 'initiate-gift',
                requiresTurn: true,
                actionToken: 'gift',
                cardIds: toStringArray(action.payload?.cardIds)
            };
        case 'RESOLVE_GIFT':
            return {
                kind: 'resolve-gift',
                requiresTurn: false,
                chosenCardId: typeof action.payload?.chosenCardId === 'string' ? action.payload.chosenCardId : undefined
            };
        case 'INITIATE_COMPETITION':
            return {
                kind: 'initiate-competition',
                requiresTurn: true,
                actionToken: 'competition',
                groups: toCompetitionGroups(action.payload?.groups)
            };
        case 'RESOLVE_COMPETITION':
            return {
                kind: 'resolve-competition',
                requiresTurn: false,
                chosenGroupIndex: typeof action.payload?.chosenGroupIndex === 'number' ? action.payload.chosenGroupIndex : undefined
            };
        default:
            return null;
    }
};
