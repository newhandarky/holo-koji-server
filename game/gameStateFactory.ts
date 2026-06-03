import type {
    Geisha,
    GeishaSet,
    ItemCard,
    OpeningDealSummary,
    OpeningDealStep,
    Player
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    ginzaBoardSlotDefinitions,
    isSupportedGeishaSet,
    normalizeGeishaSet
} from './geishaSetRules.js';
import type { PlayerMeta, PlayerMetaMap, ServerGameState } from './serverGameStateTypes.js';
import {
    cloneGeishas,
    createBaseGeishas
} from './geishaBoardFactory.js';
import {
    defaultRandomSource,
    normalizeRandomSource,
    shuffleArray,
    type PartialRandomSource
} from './gameRandomSource.js';

export {
    createDeterministicRandomSource,
    type RandomSource
} from './gameRandomSource.js';

export {
    cloneGeishas,
    cloneGeishasForNextRound,
    createBaseGeishas,
    createCustomSelectedGeishas,
    createRandomizedGeishas
} from './geishaBoardFactory.js';

interface OpeningDealInputStep {
    playerId: string;
}

interface OpeningDealOptions {
    sequenceId?: string;
    status?: 'pending' | 'completed' | 'not_replayable';
    replayable?: boolean;
}

export const createPlayer = (playerId: string, meta: PlayerMeta = {}): Player => ({
    id: playerId,
    name: meta.name ?? playerId,
    lineUserId: meta.lineUserId,
    avatarUrl: meta.avatarUrl,
    hand: [],
    playedCards: [],
    secretCards: [],
    discardedCards: [],
    actionTokens: [
        { type: 'secret', used: false },
        { type: 'trade-off', used: false },
        { type: 'gift', used: false },
        { type: 'competition', used: false }
    ],
    score: {
        charm: 0,
        tokens: 0
    }
});

export const createWaitingGameState = (
    gameId: string,
    playerIds: string[],
    geishas?: Geisha[] | null,
    geishaSet: unknown = DEFAULT_GEISHA_SET,
    playerMetaMap: PlayerMetaMap = {}
): ServerGameState => {
    const activeGeishaSet = normalizeGeishaSet(geishaSet);
    if (!isSupportedGeishaSet(activeGeishaSet)) {
        throw new Error(`Unsupported geisha set in waiting state: ${String(activeGeishaSet)}`);
    }

    return {
        gameId,
        hostId: null,
        players: playerIds.map((id) => createPlayer(id, playerMetaMap[id])),
        geishas: cloneGeishas(geishas ?? createBaseGeishas(activeGeishaSet)),
        geishaSet: activeGeishaSet as GeishaSet,
        currentPlayer: 0,
        phase: 'waiting',
        round: 1,
        winner: null,
        orderDecision: {
            isOpen: false,
            phase: 'deciding',
            players: playerIds,
            result: undefined,
            confirmations: [],
            waitingFor: playerIds,
            currentPlayer: playerIds[0] ?? ''
        },
        drawPile: [],
        discardPile: [],
        removedCard: null,
        openingDeal: undefined,
        settlement: undefined,
        pendingInteraction: null,
        lastAction: undefined
    };
};

export const createGameStateWithOrder = (
    gameId: string,
    orderedPlayerIds: string[],
    geishas?: Geisha[] | null,
    existingState: Partial<ServerGameState> | null = null,
    playerMetaMap: PlayerMetaMap = {}
): { gameState: ServerGameState } => {
    const previousState = existingState ?? {};
    const activeGeishaSet = normalizeGeishaSet(previousState.geishaSet);
    if (!isSupportedGeishaSet(activeGeishaSet)) {
        throw new Error(`Unsupported geisha set in ordered state: ${String(activeGeishaSet)}`);
    }
    const baseGeishas = geishas ?? createBaseGeishas(activeGeishaSet);

    const players = orderedPlayerIds.map((playerId) => {
        const existingPlayer = previousState.players?.find((player) => player.id === playerId);
        if (existingPlayer) {
            return {
                ...existingPlayer,
                actionTokens: existingPlayer.actionTokens.map((token) => ({ ...token, used: token.used ?? false }))
            };
        }

        return createPlayer(playerId, playerMetaMap[playerId]);
    });

    return {
        gameState: {
            gameId,
            hostId: previousState.hostId ?? null,
            players,
            geishas: cloneGeishas(baseGeishas),
            geishaSet: activeGeishaSet as GeishaSet,
            currentPlayer: 0,
            phase: 'playing',
            round: previousState.round ?? 1,
            winner: null,
            orderDecision: {
                isOpen: false,
                phase: 'result',
                players: orderedPlayerIds,
                result: {
                    firstPlayer: orderedPlayerIds[0] ?? '',
                    secondPlayer: orderedPlayerIds[1] ?? '',
                    order: orderedPlayerIds
                },
                confirmations: [...orderedPlayerIds],
                waitingFor: []
            },
            drawPile: previousState.drawPile ?? [],
            discardPile: previousState.discardPile ?? [],
            removedCard: previousState.removedCard ?? null,
            openingDeal: previousState.openingDeal,
            settlement: previousState.settlement,
            pendingInteraction: null,
            lastAction: undefined
        }
    };
};

const buildGinzaCardForGeisha = (
    geisha: Geisha,
    copy: number,
    randomSource: PartialRandomSource = defaultRandomSource
): ItemCard => {
    const source = normalizeRandomSource(randomSource);
    const boardSlot = ginzaBoardSlotDefinitions.find((slot) => slot.slotId === geisha.boardSlotId);
    if (!boardSlot) {
        throw new Error(`Missing Ginza board slot definition for slot ${geisha.boardSlotId}`);
    }

    return {
        id: `card-${geisha.id}-${copy}-${source.nextToken()}`,
        geishaId: geisha.id,
        type: boardSlot.itemAssetName,
        boardSlotId: boardSlot.slotId,
        itemAssetName: boardSlot.itemAssetName,
        itemLabel: boardSlot.itemLabel,
        itemImageUrl: boardSlot.itemImageUrl,
        itemIconUrl: boardSlot.itemIconUrl
    };
};

export const buildDeckForGeishas = (
    geishas: Geisha[],
    options: { randomSource?: PartialRandomSource } = {}
): { deck: ItemCard[]; removedCard: ItemCard | null } => {
    const { randomSource = defaultRandomSource } = options;
    const cards: ItemCard[] = [];

    geishas.forEach((geisha) => {
        const copies = geisha.charmPoints ?? 0;
        for (let copy = 0; copy < copies; copy += 1) {
            if (!geisha.boardSlotId) {
                throw new Error(`Missing boardSlotId for geisha ${geisha.id}`);
            }
            cards.push(buildGinzaCardForGeisha(geisha, copy, randomSource));
        }
    });

    const shuffled = shuffleArray(cards, randomSource);
    const removedCard = shuffled.pop() ?? null;

    return {
        deck: shuffled,
        removedCard
    };
};

export const buildOpeningDealSummary = (dealSequence: OpeningDealInputStep[] = [], options: OpeningDealOptions = {}): OpeningDealSummary => {
    const {
        sequenceId = 'opening-deal',
        status = 'completed',
        replayable = true
    } = options;
    const cardIndexesByPlayer = new Map<string, number>();
    const steps: OpeningDealStep[] = [
        {
            type: 'BURN_HIDDEN_CARD',
            order: 0,
            targetZone: 'hidden-reserve'
        }
    ];

    dealSequence.forEach((step) => {
        const currentIndex = (cardIndexesByPlayer.get(step.playerId) ?? 0) + 1;
        cardIndexesByPlayer.set(step.playerId, currentIndex);
        steps.push({
            type: 'DEAL_CARD_BACK',
            order: steps.length,
            targetPlayerId: step.playerId,
            cardIndex: currentIndex
        });
    });

    steps.push({
        type: 'OPENING_DEAL_COMPLETE',
        order: steps.length
    });

    return {
        sequenceId,
        status,
        completed: status === 'completed' || status === 'not_replayable',
        replayable,
        steps
    };
};

export const markOpeningDealNotReplayable = (openingDeal?: OpeningDealSummary): OpeningDealSummary | undefined => {
    if (!openingDeal) {
        return openingDeal;
    }

    return {
        ...openingDeal,
        status: 'not_replayable',
        replayable: false,
        completed: true,
        steps: Array.isArray(openingDeal.steps)
            ? openingDeal.steps.map((step) => ({ ...step }))
            : []
    };
};
