export type ConfirmationFlowUpdate = {
    added: boolean;
    confirmations: string[];
    waitingFor: string[];
    shouldStartRematch: boolean;
};

export type ReadyCheckState = {
    confirmations: string[];
    waitingFor: string[];
};

export const buildRematchConfirmationUpdate = (
    playerIds: readonly string[],
    existingConfirmations: Iterable<string>,
    playerId: string,
    npcId: string | null = null
): ConfirmationFlowUpdate => {
    const confirmations = Array.from(existingConfirmations);
    if (!confirmations.includes(playerId)) {
        confirmations.push(playerId);
    }
    if (npcId && !confirmations.includes(npcId)) {
        confirmations.push(npcId);
    }

    return {
        added: !Array.from(existingConfirmations).includes(playerId),
        confirmations,
        waitingFor: playerIds.filter(id => !confirmations.includes(id)),
        shouldStartRematch: confirmations.length >= 2
    };
};

export const buildReadyCheckState = (
    playerIds: readonly string[]
): ReadyCheckState => ({
    confirmations: [],
    waitingFor: [...playerIds]
});
