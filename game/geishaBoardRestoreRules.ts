import type {
    CustomCharacterSelection,
    Geisha,
    GeishaSet
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    ginzaBoardSlotDefinitions
} from './geishaSetCatalog.js';
import {
    getCharacterPoolForSet,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode,
    validateCustomCharacterSelection
} from './geishaSetupRules.js';

interface RestorableSnapshot {
    geishaSet?: unknown;
    setupMode?: unknown;
    customSelection?: CustomCharacterSelection;
    baseGeishas?: Geisha[];
    gameState?: {
        geishaSet?: unknown;
        setupMode?: unknown;
        customSelection?: CustomCharacterSelection;
        geishas?: Geisha[];
    };
}

interface RestorableSetOptions {
    isSupportedSet?: (setKey: unknown) => boolean;
}

export const resolveRestorableGeishaSet = (
    snapshot: RestorableSnapshot = {},
    options: RestorableSetOptions = {}
): GeishaSet | string => {
    const {
        isSupportedSet = isSupportedGeishaSet
    } = options;
    const snapshotSet = snapshot?.geishaSet ?? snapshot?.gameState?.geishaSet;
    if (snapshotSet === undefined || snapshotSet === null || snapshotSet === '') {
        throw new Error('Missing geisha set in room snapshot.');
    }

    const activeSet = normalizeGeishaSet(snapshotSet);
    if (!isSupportedSet(activeSet)) {
        throw new Error(`Unsupported geisha set in room snapshot: ${String(activeSet)}`);
    }
    return activeSet;
};

export const validateMatchBoardForSet = (setKey: unknown = DEFAULT_GEISHA_SET, geishas: Geisha[] = []): void => {
    const activeSet = normalizeGeishaSet(setKey);
    const characterPool = getCharacterPoolForSet(activeSet);
    const validCharacterIds = new Set(characterPool.map((character) => character.characterId));
    const validBoardSlotIds = new Set(ginzaBoardSlotDefinitions.map((slot) => slot.slotId));
    if (!Array.isArray(geishas) || geishas.length !== 7) {
        throw new Error(`Match board for ${activeSet} must contain exactly seven geishas.`);
    }

    const boardSlotIds = new Set<number>();
    const characterIds = new Set<string>();
    geishas.forEach((geisha) => {
        if (!geisha?.characterId || !validCharacterIds.has(geisha.characterId)) {
            throw new Error(`Match board for ${activeSet} contains a character outside the selected set.`);
        }
        if (!geisha?.boardSlotId || !validBoardSlotIds.has(geisha.boardSlotId)) {
            throw new Error(`Match board for ${activeSet} contains an unknown board slot.`);
        }
        if (characterIds.has(geisha.characterId)) {
            throw new Error(`Match board for ${activeSet} must contain unique characters.`);
        }
        if (boardSlotIds.has(geisha.boardSlotId)) {
            throw new Error(`Match board for ${activeSet} must contain unique board slots.`);
        }
        characterIds.add(geisha.characterId);
        boardSlotIds.add(geisha.boardSlotId);
    });
};

const boardCharacterIdSet = (geishas: Geisha[] = []) => new Set(geishas.map((geisha) => geisha.characterId));

export const validateMatchBoardForCustomSelection = (
    setKey: unknown = DEFAULT_GEISHA_SET,
    geishas: Geisha[] = [],
    customSelection: Partial<CustomCharacterSelection> = {}
): void => {
    const validatedSelection = validateCustomCharacterSelection(setKey, customSelection);
    validateMatchBoardForSet(setKey, geishas);

    const boardIds = boardCharacterIdSet(geishas);
    validatedSelection.characterIds.forEach((characterId) => {
        if (!boardIds.has(characterId)) {
            throw new Error(`Custom match board for ${normalizeGeishaSet(setKey)} must match the selected custom characters.`);
        }
    });
};

export const resolveRestorableBoardForSet = (
    snapshot: RestorableSnapshot = {},
    setKey: unknown = DEFAULT_GEISHA_SET
): Geisha[] => {
    const resolvedBoard = snapshot?.baseGeishas ?? snapshot?.gameState?.geishas;
    const setupMode = normalizeRoomSetupMode(snapshot?.setupMode ?? snapshot?.gameState?.setupMode);
    const customSelection = snapshot?.customSelection ?? snapshot?.gameState?.customSelection;

    if (!resolvedBoard) {
        throw new Error(`Missing match board for ${normalizeGeishaSet(setKey)} room snapshot.`);
    }

    validateMatchBoardForSet(setKey, resolvedBoard);
    if (setupMode === 'custom') {
        validateMatchBoardForCustomSelection(setKey, resolvedBoard, customSelection);
    }

    if (snapshot?.baseGeishas && snapshot?.gameState?.geishas) {
        validateMatchBoardForSet(setKey, snapshot.gameState.geishas);
        if (setupMode === 'custom') {
            validateMatchBoardForCustomSelection(setKey, snapshot.gameState.geishas, customSelection);
        }
        const toBoardIdentity = (geishas: Geisha[]) => [...geishas]
            .sort((left, right) => (left.boardSlotId ?? 0) - (right.boardSlotId ?? 0))
            .map((geisha) => `${geisha.characterId}:${geisha.boardSlotId}`)
            .join('|');
        const baseIdentity = toBoardIdentity(snapshot.baseGeishas);
        const stateIdentity = toBoardIdentity(snapshot.gameState.geishas);
        if (baseIdentity !== stateIdentity) {
            throw new Error(`Restored match board for ${normalizeGeishaSet(setKey)} must match the saved base board.`);
        }
    }

    return resolvedBoard;
};
