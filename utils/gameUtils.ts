import type {
    CustomCharacterSelection,
    GameState,
    GeishaSet,
    ItemCard,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';

export {
    charmPointsDistribution,
    DEFAULT_GEISHA_SET,
    SUPPORTED_GEISHA_SETS,
    ROOM_SETUP_MODES,
    DEFAULT_ROOM_SETUP_MODE,
    CUSTOM_SELECTION_SIZE,
    characterPoolsBySet,
    ginzaCharacterPool,
    collaborationCharacterPool,
    hololiveCharacterPool,
    geishaSetMetadata,
    ginzaBoardSlotDefinitions,
    normalizeGeishaSet,
    isSupportedGeishaSet,
    normalizeRoomSetupMode,
    getCharacterPoolForSet,
    validateCustomCharacterSelection,
    resolveRestorableGeishaSet,
    validateMatchBoardForSet,
    validateMatchBoardForCustomSelection,
    resolveRestorableBoardForSet,
    validateCharacterSetData,
    validateGinzaSetupData
} from '../game/geishaSetRules.js';

export {
    buildDeckForGeishas,
    buildOpeningDealSummary,
    cloneGeishas,
    cloneGeishasForNextRound,
    createBaseGeishas,
    createCustomSelectedGeishas,
    createDeterministicRandomSource,
    createGameStateWithOrder,
    createPlayer,
    createRandomizedGeishas,
    createWaitingGameState,
    markOpeningDealNotReplayable,
    type PlayerMeta,
    type RandomSource
} from '../game/gameStateFactory.js';

export {
    buildPlayerVisibleGameState,
    createHiddenCard,
    createHiddenCards,
    sanitizePendingInteractionForViewer,
    type VisibleStateOptions
} from '../game/playerVisibleState.js';

interface PlayerMeta {
    name?: string;
    lineUserId?: string;
    avatarUrl?: string;
}

export type PlayerMetaMap = Record<string, PlayerMeta | undefined>;

type ServerOrderDecision = Omit<GameState['orderDecision'], 'currentPlayer'> & {
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
