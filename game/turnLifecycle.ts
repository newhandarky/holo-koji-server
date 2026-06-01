import type {
    GameState,
    ItemCard,
    Player
} from '@newhandarky/hanakoji-game-types';

export type TurnLifecycleState = Pick<
    GameState,
    'players' | 'currentPlayer' | 'drawPile' | 'phase' | 'pendingInteraction' | 'lastAction'
>;

type CurrentTurnOutcome =
    | { type: 'missing-player' }
    | { type: 'skip-player'; playerId: string }
    | { type: 'drawn-card'; playerId: string; card: ItemCard }
    | { type: 'empty-draw-pile'; playerId: string };

type NextTurnOutcome =
    | { type: 'next-player'; playerId: string; playerIndex: number }
    | { type: 'resolve-round' };

export type CurrentTurnResult<T extends TurnLifecycleState> = {
    gameState: T;
    outcome: CurrentTurnOutcome;
};

export type NextTurnResult<T extends TurnLifecycleState> = {
    gameState: T;
    outcome: NextTurnOutcome;
};

const clonePlayer = (player: Player): Player => ({
    ...player,
    hand: [...player.hand],
    playedCards: [...player.playedCards],
    secretCards: [...player.secretCards],
    discardedCards: [...player.discardedCards],
    actionTokens: player.actionTokens.map(token => ({ ...token })),
    score: { ...player.score }
});

const cloneTurnLifecycleState = <T extends TurnLifecycleState>(gameState: T): T => ({
    ...gameState,
    players: gameState.players.map(clonePlayer),
    drawPile: [...gameState.drawPile]
});

const hasAvailableAction = (player: Player): boolean => (
    player.actionTokens.some(token => !token.used)
);

export const prepareCurrentTurn = <T extends TurnLifecycleState>(
    gameState: T
): CurrentTurnResult<T> => {
    const nextState = cloneTurnLifecycleState(gameState);
    const currentPlayer = nextState.players[nextState.currentPlayer];

    if (!currentPlayer) {
        return {
            gameState: nextState,
            outcome: { type: 'missing-player' }
        };
    }

    if (!hasAvailableAction(currentPlayer)) {
        return {
            gameState: nextState,
            outcome: {
                type: 'skip-player',
                playerId: currentPlayer.id
            }
        };
    }

    const drawnCard = nextState.drawPile.shift() ?? null;
    if (drawnCard) {
        currentPlayer.hand.push(drawnCard);
    }

    nextState.phase = 'playing';
    nextState.pendingInteraction = null;
    nextState.lastAction = undefined;

    return {
        gameState: nextState,
        outcome: drawnCard
            ? {
                type: 'drawn-card',
                playerId: currentPlayer.id,
                card: drawnCard
            }
            : {
                type: 'empty-draw-pile',
                playerId: currentPlayer.id
            }
    };
};

export const advanceToNextTurn = <T extends TurnLifecycleState>(
    gameState: T
): NextTurnResult<T> => {
    const nextState = cloneTurnLifecycleState(gameState);

    for (let offset = 1; offset <= nextState.players.length; offset += 1) {
        const playerIndex = (nextState.currentPlayer + offset) % nextState.players.length;
        const candidate = nextState.players[playerIndex];
        if (candidate && hasAvailableAction(candidate)) {
            nextState.currentPlayer = playerIndex;
            return {
                gameState: nextState,
                outcome: {
                    type: 'next-player',
                    playerId: candidate.id,
                    playerIndex
                }
            };
        }
    }

    return {
        gameState: nextState,
        outcome: { type: 'resolve-round' }
    };
};

export const revealSecretCards = (players: readonly Player[]): Player[] => (
    players.map(player => {
        const nextPlayer = clonePlayer(player);
        nextPlayer.playedCards.push(...nextPlayer.secretCards);
        nextPlayer.secretCards = [];
        return nextPlayer;
    })
);
