import type {
    CharacterProfile,
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import {
    characterPoolsBySet,
    charmPointsDistribution,
    CUSTOM_SELECTION_SIZE,
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    ROOM_SETUP_MODES,
    SUPPORTED_GEISHA_SETS
} from './geishaSetCatalog.js';
import type { BoardSlotDefinition } from './geishaSetCatalog.js';

export {
    characterPoolsBySet,
    charmPointsDistribution,
    collaborationCharacterPool,
    CUSTOM_SELECTION_SIZE,
    DEFAULT_GEISHA_SET,
    DEFAULT_ROOM_SETUP_MODE,
    geishaSetMetadata,
    ginzaBoardSlotDefinitions,
    ginzaCharacterPool,
    hololiveCharacterPool,
    resolveAssetUrl,
    ROOM_SETUP_MODES,
    SUPPORTED_GEISHA_SETS
} from './geishaSetCatalog.js';

export type { BoardSlotDefinition } from './geishaSetCatalog.js';

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

const isGeishaSet = (value: unknown): value is GeishaSet => (
    SUPPORTED_GEISHA_SETS.includes(value as GeishaSet)
);

const isRoomSetupMode = (value: unknown): value is RoomSetupMode => (
    ROOM_SETUP_MODES.includes(value as RoomSetupMode)
);

export const normalizeGeishaSet = (setKey: unknown = DEFAULT_GEISHA_SET): GeishaSet | string => (
    setKey === undefined || setKey === null
        ? DEFAULT_GEISHA_SET
        : String(setKey)
);

export const isSupportedGeishaSet = (setKey: unknown = DEFAULT_GEISHA_SET): boolean => {
    const activeSet = normalizeGeishaSet(setKey);
    const characterPool = isGeishaSet(activeSet) ? characterPoolsBySet[activeSet] : undefined;
    return isGeishaSet(activeSet) && Array.isArray(characterPool) && characterPool.length >= 7;
};

export const normalizeRoomSetupMode = (setupMode: unknown = DEFAULT_ROOM_SETUP_MODE): RoomSetupMode => {
    if (setupMode === undefined || setupMode === null || setupMode === '') {
        return DEFAULT_ROOM_SETUP_MODE;
    }
    if (!isRoomSetupMode(setupMode)) {
        throw new Error(`Unsupported room setup mode: ${String(setupMode)}`);
    }
    return setupMode;
};

export const getCharacterPoolForSet = (setKey: unknown = DEFAULT_GEISHA_SET): CharacterProfile[] => {
    const activeSet = normalizeGeishaSet(setKey);
    if (!isGeishaSet(activeSet)) {
        throw new Error(`Unsupported geisha set: ${activeSet}`);
    }
    return characterPoolsBySet[activeSet];
};

export const validateCharacterSetData = (
    setKey: unknown = DEFAULT_GEISHA_SET,
    characterPool: CharacterProfile[] = getCharacterPoolForSet(setKey)
): void => {
    const activeSet = normalizeGeishaSet(setKey);
    if (!isGeishaSet(activeSet)) {
        throw new Error(`Unsupported geisha set: ${activeSet}`);
    }
    if (!Array.isArray(characterPool) || characterPool.length < 7) {
        throw new Error(`Geisha character pool for ${activeSet} must contain at least seven characters.`);
    }

    const characterIds = new Set<string>();
    characterPool.forEach((character) => {
        if (!character?.characterId || !character?.name || !character?.imageUrl) {
            throw new Error(`Geisha character records for ${activeSet} must include characterId, name, and imageUrl.`);
        }
        if (characterIds.has(character.characterId)) {
            throw new Error(`Duplicate geisha characterId detected for ${activeSet}: ${character.characterId}`);
        }
        characterIds.add(character.characterId);
    });
};

export const validateGinzaSetupData = (
    characterPool: CharacterProfile[] = ginzaCharacterPool,
    boardSlots: BoardSlotDefinition[] = ginzaBoardSlotDefinitions
): void => {
    validateCharacterSetData(DEFAULT_GEISHA_SET, characterPool);

    if (!Array.isArray(boardSlots) || boardSlots.length !== 7) {
        throw new Error('Ginza board slot definitions must contain exactly seven entries.');
    }

    const slotIds = new Set<number>();
    const slotOrders = new Set<number>();
    const charms: number[] = [];

    boardSlots.forEach((slot) => {
        if (
            typeof slot?.slotId !== 'number' ||
            typeof slot?.slotOrder !== 'number' ||
            typeof slot?.charmPoints !== 'number' ||
            !slot?.itemAssetName ||
            !slot?.itemLabel ||
            !slot?.itemImageUrl ||
            !slot?.itemIconUrl
        ) {
            throw new Error('Each Ginza board slot must include slotId, slotOrder, charmPoints, itemAssetName, itemLabel, itemImageUrl, and itemIconUrl.');
        }
        if (slotIds.has(slot.slotId)) {
            throw new Error(`Duplicate Ginza slotId detected: ${slot.slotId}`);
        }
        if (slotOrders.has(slot.slotOrder)) {
            throw new Error(`Duplicate Ginza slotOrder detected: ${slot.slotOrder}`);
        }
        slotIds.add(slot.slotId);
        slotOrders.add(slot.slotOrder);
        charms.push(slot.charmPoints);
    });

    const sortedCharmKey = charms.sort((a, b) => a - b).join(',');
    if (sortedCharmKey !== [...charmPointsDistribution].sort((a, b) => a - b).join(',')) {
        throw new Error('Ginza board slot charm distribution must be 2,2,2,3,3,4,5.');
    }
};

export const validateCustomCharacterSelection = (
    setKey: unknown = DEFAULT_GEISHA_SET,
    customSelection: Partial<CustomCharacterSelection> = {},
    options: { characterPool?: CharacterProfile[] } = {}
): CustomCharacterSelection => {
    const activeSet = normalizeGeishaSet(setKey);
    const characterPool = options.characterPool ?? getCharacterPoolForSet(activeSet);
    validateCharacterSetData(activeSet, characterPool);

    const characterIds = customSelection?.characterIds;
    if (!Array.isArray(characterIds)) {
        throw new Error('Custom character selection must include characterIds.');
    }
    if (characterIds.length !== CUSTOM_SELECTION_SIZE) {
        throw new Error(`Custom character selection must contain exactly ${CUSTOM_SELECTION_SIZE} characterIds.`);
    }

    const validCharacterIds = new Set(characterPool.map((character) => character.characterId));
    const uniqueCharacterIds = new Set<string>();
    characterIds.forEach((characterId) => {
        if (typeof characterId !== 'string' || !characterId.trim()) {
            throw new Error('Custom character selection contains an invalid characterId.');
        }
        if (uniqueCharacterIds.has(characterId)) {
            throw new Error('Custom character selection must contain unique characterIds.');
        }
        if (!validCharacterIds.has(characterId)) {
            throw new Error('Custom character selection contains a character outside the selected set.');
        }
        uniqueCharacterIds.add(characterId);
    });

    return {
        characterIds: [...characterIds]
    };
};

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
