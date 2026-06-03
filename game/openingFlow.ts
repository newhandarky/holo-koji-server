import type { Geisha, GeishaSet } from '@newhandarky/hanakoji-game-types';
import { cloneGeishas } from './geishaBoardFactory.js';
import { createWaitingGameState } from './serverGameStateFactory.js';
import type {
    PlayerMetaMap,
    ServerGameState
} from './serverGameStateTypes.js';

export type OrderDecisionResult = {
    firstPlayer: string;
    secondPlayer: string;
    order: string[];
};

export type OrderDecisionState = {
    isDeciding: boolean;
    result: OrderDecisionResult | null;
    confirmations: Set<string>;
};

type OpeningFlowResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    errorMessage: string;
};

type BuildOrderDecisionStateInput = {
    roomId: string;
    hostId: string | null;
    playerIds: readonly string[];
    baseGeishas: readonly Geisha[];
    geishaSet: GeishaSet;
    playerMetaMap?: PlayerMetaMap;
};

export type ConfirmationUpdate = {
    added: boolean;
    confirmations: string[];
    waitingFor: string[];
};

export const createOrderDecisionState = (): OrderDecisionState => ({
    isDeciding: false,
    result: null,
    confirmations: new Set()
});

export const buildOrderDecisionGameState = ({
    roomId,
    hostId,
    playerIds,
    baseGeishas,
    geishaSet,
    playerMetaMap = {}
}: BuildOrderDecisionStateInput): OpeningFlowResult<ServerGameState> => {
    if (playerIds.length < 2) {
        return { ok: false, errorMessage: '玩家不足，無法準備順序決定' };
    }

    const gameState = createWaitingGameState(
        roomId,
        [...playerIds],
        cloneGeishas([...baseGeishas]),
        geishaSet,
        playerMetaMap
    );
    gameState.hostId = hostId;
    gameState.phase = 'deciding_order';
    gameState.orderDecision = {
        isOpen: true,
        phase: 'deciding',
        players: [...playerIds],
        result: undefined,
        confirmations: [],
        waitingFor: [...playerIds],
        currentPlayer: playerIds[0] ?? ''
    };

    return { ok: true, value: gameState };
};

export const choosePlayerOrder = (
    playerIds: readonly string[],
    randomValue: number = Math.random()
): OrderDecisionResult | null => {
    if (playerIds.length < 2) {
        return null;
    }

    const firstPlayerIndex = randomValue < 0.5 ? 0 : 1;
    const firstPlayer = playerIds[firstPlayerIndex] ?? '';
    const secondPlayer = playerIds[1 - firstPlayerIndex] ?? '';

    return {
        firstPlayer,
        secondPlayer,
        order: [firstPlayer, secondPlayer]
    };
};

export const applyOrderDecisionResult = (
    gameState: ServerGameState,
    result: OrderDecisionResult
): ServerGameState => ({
    ...gameState,
    players: result.order
        .map(playerId => gameState.players.find(player => player.id === playerId))
        .filter((player): player is ServerGameState['players'][number] => Boolean(player)),
    currentPlayer: 0,
    orderDecision: {
        ...gameState.orderDecision,
        phase: 'result',
        result,
        confirmations: [],
        waitingFor: [...result.order]
    }
});

export const buildConfirmationUpdate = (
    playerIds: readonly string[],
    existingConfirmations: Iterable<string>,
    playerId: string
): ConfirmationUpdate => {
    const confirmations = Array.from(existingConfirmations);
    const added = !confirmations.includes(playerId);
    if (added) {
        confirmations.push(playerId);
    }

    return {
        added,
        confirmations,
        waitingFor: playerIds.filter(id => !confirmations.includes(id))
    };
};

export const applyOrderConfirmation = (
    gameState: ServerGameState,
    update: ConfirmationUpdate
): ServerGameState => ({
    ...gameState,
    orderDecision: {
        ...gameState.orderDecision,
        confirmations: [...update.confirmations],
        waitingFor: [...update.waitingFor]
    }
});

export const canStartGameWithOrder = (
    playerIds: readonly string[],
    result: OrderDecisionResult | null,
    orderConfirmations: Iterable<string>,
    readyConfirmations: Iterable<string>
): boolean => {
    if (!result) {
        return false;
    }

    const confirmedOrder = new Set(orderConfirmations);
    const confirmedReady = new Set(readyConfirmations);
    return playerIds.every(playerId => confirmedOrder.has(playerId))
        && playerIds.every(playerId => confirmedReady.has(playerId));
};
