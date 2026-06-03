import type {
    Geisha,
    GeishaSet,
    Player
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    isSupportedGeishaSet,
    normalizeGeishaSet
} from './geishaSetRules.js';
import type { PlayerMeta, PlayerMetaMap, ServerGameState } from './serverGameStateTypes.js';
import {
    cloneGeishas,
    createBaseGeishas
} from './geishaBoardFactory.js';

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
