import type { Geisha } from '@newhandarky/hanakoji-game-types';

export type RoundPlayerScore = {
    charm: number;
    tokens: number;
};

export type RoundResolutionPlayer = {
    id: string;
    playedCards: ReadonlyArray<{
        geishaId: number;
    }>;
};

export type ScoredRoundPlayer = {
    id: string;
    score: RoundPlayerScore;
};

export type RoundResolutionResult = {
    geishas: Geisha[];
    scores: Map<string, RoundPlayerScore>;
};

const countCardsForGeisha = (player: RoundResolutionPlayer, geishaId: number): number => (
    player.playedCards.filter(card => card.geishaId === geishaId).length
);

export const resolveRoundBoard = (
    geishas: readonly Geisha[],
    players: readonly RoundResolutionPlayer[]
): RoundResolutionResult => {
    const [firstPlayer, secondPlayer] = players;
    const resolvedGeishas = geishas.map(geisha => ({ ...geisha }));

    if (firstPlayer && secondPlayer) {
        resolvedGeishas.forEach((geisha) => {
            const firstCount = countCardsForGeisha(firstPlayer, geisha.id);
            const secondCount = countCardsForGeisha(secondPlayer, geisha.id);

            if (firstCount > secondCount) {
                geisha.controlledBy = firstPlayer.id;
            } else if (secondCount > firstCount) {
                geisha.controlledBy = secondPlayer.id;
            }
        });
    }

    const scores = new Map<string, RoundPlayerScore>();
    players.forEach((player) => {
        const controlled = resolvedGeishas.filter(geisha => geisha.controlledBy === player.id);
        scores.set(player.id, {
            tokens: controlled.length,
            charm: controlled.reduce((total, geisha) => total + geisha.charmPoints, 0)
        });
    });

    return {
        geishas: resolvedGeishas,
        scores
    };
};

export const determineWinner = (players: readonly ScoredRoundPlayer[]): string | null => {
    const [playerA, playerB] = players;
    if (!playerA || !playerB) {
        return null;
    }

    const aCharm = playerA.score.charm;
    const bCharm = playerB.score.charm;
    const aTokens = playerA.score.tokens;
    const bTokens = playerB.score.tokens;

    if (aCharm >= 11 || bCharm >= 11) {
        if (aCharm > bCharm) return playerA.id;
        if (bCharm > aCharm) return playerB.id;
        return null;
    }

    if (aTokens >= 4 || bTokens >= 4) {
        if (aTokens > bTokens) return playerA.id;
        if (bTokens > aTokens) return playerB.id;
    }

    return null;
};

export const getNextRoundOrder = (
    players: readonly Pick<RoundResolutionPlayer, 'id'>[],
    lastRoundStarterId: string | null | undefined
): string[] => {
    if (players.length < 2) {
        return [];
    }

    const firstPlayer = players[0];
    if (!firstPlayer) {
        return [];
    }

    const currentStarter = lastRoundStarterId ?? firstPlayer.id;
    const nextStarter = players.find(player => player.id !== currentStarter)?.id ?? firstPlayer.id;

    return [nextStarter, currentStarter];
};
