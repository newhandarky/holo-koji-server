import type {
    CharacterProfile,
    CustomCharacterSelection,
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
    SUPPORTED_GEISHA_SETS,
    type BoardSlotDefinition
} from './geishaSetCatalog.js';

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
