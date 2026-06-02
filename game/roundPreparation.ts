import type { Geisha, ItemCard } from '@newhandarky/hanakoji-game-types';
import {
    buildDeckForGeishas,
    buildOpeningDealSummary,
    cloneGeishas,
    createPlayer,
    type RandomSource
} from './gameStateFactory.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from './serverGameStateTypes.js';

export type DealSequenceStep = {
    order: number;
    playerId: string;
    card: ItemCard;
};

export type RoundSetupDiagnostics = {
    totalPlayers: number;
    handSizes: number[];
    drawPileSize: number;
    totalCardsInGame: number;
    hasUnexpectedTotalCards: boolean;
    hasUnexpectedHandSizes: boolean;
    hasUnexpectedDrawPileSize: boolean;
    hasDuplicateCardIds: boolean;
};

type RoundPreparationInput = {
    roomId: string;
    hostId: string | null;
    playerIds: readonly string[];
    baseGeishas: readonly Geisha[];
    playerMetaMap?: PlayerMetaMap;
    roundNumber: number;
    openOrderDecision?: boolean;
    randomSource?: Partial<RandomSource>;
};

type RoundPreparationSuccess = {
    ok: true;
    gameState: ServerGameState;
    dealSequence: DealSequenceStep[];
    diagnostics: RoundSetupDiagnostics;
};

type RoundPreparationFailure = {
    ok: false;
    errorMessage: string;
};

export type RoundPreparationResult = RoundPreparationSuccess | RoundPreparationFailure;

export const inspectRoundSetup = (gameState: ServerGameState): RoundSetupDiagnostics => {
    const totalPlayers = gameState.players.length;
    const handSizes = gameState.players.map(player => player.hand.length);
    const totalHandCards = handSizes.reduce((sum, count) => sum + count, 0);
    const totalCardsInGame = totalHandCards + gameState.drawPile.length + (gameState.removedCard ? 1 : 0);
    const cardIds = new Set<string>();
    let hasDuplicateCardIds = false;

    const collect = (card: ItemCard) => {
        if (cardIds.has(card.id)) {
            hasDuplicateCardIds = true;
        }
        cardIds.add(card.id);
    };

    gameState.players.forEach(player => player.hand.forEach(collect));
    gameState.drawPile.forEach(collect);
    if (gameState.removedCard) {
        collect(gameState.removedCard);
    }

    return {
        totalPlayers,
        handSizes,
        drawPileSize: gameState.drawPile.length,
        totalCardsInGame,
        hasUnexpectedTotalCards: totalCardsInGame !== 21,
        hasUnexpectedHandSizes: totalPlayers === 2 && handSizes.some(size => size !== 6),
        hasUnexpectedDrawPileSize: totalPlayers === 2 && gameState.drawPile.length !== 8,
        hasDuplicateCardIds
    };
};

export const buildPreparedRoundState = ({
    roomId,
    hostId,
    playerIds,
    baseGeishas,
    playerMetaMap = {},
    roundNumber,
    openOrderDecision = true,
    randomSource
}: RoundPreparationInput): RoundPreparationResult => {
    if (playerIds.length < 2) {
        return { ok: false, errorMessage: '玩家不足，無法準備回合' };
    }

    const geishas = cloneGeishas([...baseGeishas]);
    const { deck, removedCard } = buildDeckForGeishas(geishas, { randomSource });
    const drawPile = [...deck];
    const dealSequence: DealSequenceStep[] = [];
    const players = playerIds.map(playerId => createPlayer(playerId, playerMetaMap[playerId]));

    for (let round = 0; round < 6; round += 1) {
        for (const [index, playerId] of playerIds.entries()) {
            const dealtCard = drawPile.shift();
            const targetPlayer = players[index];
            if (!dealtCard || !targetPlayer) {
                return { ok: false, errorMessage: '發牌時牌庫不足' };
            }
            targetPlayer.hand.push(dealtCard);
            dealSequence.push({
                order: dealSequence.length,
                playerId,
                card: dealtCard
            });
        }
    }

    const openingDeal = buildOpeningDealSummary(dealSequence, {
        sequenceId: `opening-${roomId}-round-${roundNumber}`
    });
    const gameState: ServerGameState = {
        gameId: roomId,
        hostId,
        players,
        geishas,
        currentPlayer: 0,
        phase: openOrderDecision ? 'deciding_order' : 'playing',
        round: roundNumber,
        winner: null,
        orderDecision: {
            isOpen: openOrderDecision,
            phase: openOrderDecision ? 'deciding' : 'result',
            players: [...playerIds],
            result: openOrderDecision ? undefined : {
                firstPlayer: playerIds[0] ?? '',
                secondPlayer: playerIds[1] ?? '',
                order: [...playerIds]
            },
            confirmations: openOrderDecision ? [] : [...playerIds],
            waitingFor: openOrderDecision ? [...playerIds] : [],
            currentPlayer: playerIds[0] ?? ''
        },
        drawPile,
        discardPile: [],
        removedCard,
        openingDeal,
        settlement: undefined,
        pendingInteraction: null,
        lastAction: undefined
    };

    return {
        ok: true,
        gameState,
        dealSequence,
        diagnostics: inspectRoundSetup(gameState)
    };
};
