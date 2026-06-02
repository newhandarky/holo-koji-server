import type {
    CustomCharacterSelection,
    GameState,
    GeishaSet,
    ItemCard,
    PendingInteraction,
    Player,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import { DEFAULT_GEISHA_SET } from '../game/geishaSetRules.js';

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

interface VisibleStateOptions {
    geishaSet?: GeishaSet;
}

export const sanitizePendingInteractionForViewer = (
    pendingInteraction: PendingInteraction | null | undefined,
    viewerId: string
): PendingInteraction | null => {
    if (!pendingInteraction) {
        return null;
    }

    if (pendingInteraction.targetPlayerId === viewerId) {
        return pendingInteraction;
    }

    if (pendingInteraction.type === 'GIFT_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            offeredCards: []
        };
    }

    if (pendingInteraction.type === 'COMPETITION_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            groups: []
        };
    }

    return null;
};

const createHiddenCard = (prefix: string, index: number): ItemCard => ({
    id: `hidden-${prefix}-${index}`,
    geishaId: 0,
    type: 'hidden'
});

const createHiddenCards = (count: number, prefix: string): ItemCard[] => Array.from({ length: count }, (_, index) => createHiddenCard(prefix, index));

export const buildPlayerVisibleGameState = (
    gameState: ServerGameState | null | undefined,
    viewerId: string,
    options: VisibleStateOptions = {}
): ServerGameState | null => {
    if (!gameState) {
        return null;
    }

    const activeGeishaSet = gameState.geishaSet ?? options.geishaSet ?? DEFAULT_GEISHA_SET;
    const sanitizedPlayers = (gameState.players ?? []).map((player): Player => {
        if (player.id === viewerId) {
            return player;
        }

        return {
            ...player,
            hand: createHiddenCards(player.hand?.length ?? 0, `${player.id}-hand`),
            secretCards: [],
            discardedCards: createHiddenCards(player.discardedCards?.length ?? 0, `${player.id}-discard`)
        };
    });

    return {
        ...gameState,
        geishaSet: activeGeishaSet,
        players: sanitizedPlayers,
        drawPile: [],
        removedCard: null,
        settlement: gameState.phase === 'ended'
            ? {
                ...(gameState.settlement ?? {}),
                ...(gameState.removedCard ? { removedCard: gameState.removedCard } : {})
            }
            : undefined,
        pendingInteraction: sanitizePendingInteractionForViewer(gameState.pendingInteraction, viewerId)
    };
};
