import type {
    CustomCharacterSelection,
    GameState,
    GeishaSet,
    ItemCard,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';

export interface PlayerMeta {
    name?: string;
    lineUserId?: string;
    avatarUrl?: string;
}

export type PlayerMetaMap = Record<string, PlayerMeta | undefined>;

export type ServerOrderDecision = Omit<GameState['orderDecision'], 'currentPlayer'> & {
    currentPlayer?: string;
};

export type ServerGameState = Omit<GameState, 'removedCard' | 'settlement' | 'orderDecision' | 'winner'> & {
    hostId?: string | null;
    orderDecision: ServerOrderDecision;
    geishaSet?: GeishaSet;
    setupMode?: RoomSetupMode;
    customSelection?: CustomCharacterSelection;
    removedCard?: ItemCard | null;
    winner?: string | null;
    settlement?: {
        removedCard?: ItemCard | null;
    };
};
