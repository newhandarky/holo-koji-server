import type {
    CharacterProfile,
    CustomCharacterSelection,
    Geisha,
    GeishaSet,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import { characterProfilesBySet } from '../utils/characterProfiles.js';

const DEFAULT_WEB_APP_URL = 'https://newhandarky.github.io/holo-koji';
const assetBaseUrl = (process.env.WEB_APP_URL || process.env.REACT_APP_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');

export interface BoardSlotDefinition {
    slotId: number;
    slotOrder: number;
    charmPoints: number;
    itemAssetName: string;
    itemLabel: string;
    itemImageUrl: string;
    itemIconUrl: string;
}

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

export const resolveAssetUrl = (assetPath?: string): string => {
    if (!assetPath) {
        return '';
    }

    if (/^https?:\/\//i.test(assetPath)) {
        return assetPath;
    }

    const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${assetBaseUrl}${normalizedPath}`;
};

export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];
export const DEFAULT_GEISHA_SET: GeishaSet = 'default';
export const SUPPORTED_GEISHA_SETS: readonly GeishaSet[] = ['default', 'collaboration', 'hololive'];
export const ROOM_SETUP_MODES: readonly RoomSetupMode[] = ['random', 'custom'];
export const DEFAULT_ROOM_SETUP_MODE: RoomSetupMode = 'random';
export const CUSTOM_SELECTION_SIZE = 7;

export const characterPoolsBySet = characterProfilesBySet;
export const ginzaCharacterPool = characterPoolsBySet.default;
export const collaborationCharacterPool = characterPoolsBySet.collaboration;
export const hololiveCharacterPool = characterPoolsBySet.hololive;

export const geishaSetMetadata: Record<GeishaSet, { key: GeishaSet; label: string }> = {
    default: {
        key: 'default',
        label: 'Ginza'
    },
    collaboration: {
        key: 'collaboration',
        label: '擅自合作系列'
    },
    hololive: {
        key: 'hololive',
        label: 'Hololive'
    }
};

export const ginzaBoardSlotDefinitions: BoardSlotDefinition[] = [
    {
        slotId: 1,
        slotOrder: 0,
        charmPoints: 2,
        itemAssetName: 'sake_01',
        itemLabel: 'Sake 01',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-1d939810-f728-421d-8739-7a9531ba32d9-sake01.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-0263adb6-f340-46f9-86d6-0af83cdc0693-ChatGPT-Image-2026-5-1-02_20_07.png'
    },
    {
        slotId: 2,
        slotOrder: 1,
        charmPoints: 2,
        itemAssetName: 'sake_02',
        itemLabel: 'Sake 02',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-9a9a151f-f152-4635-9a2a-b8c32b9b980c-sake04.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-012e2f1c-59e5-422c-92f5-c2d836144343-ChatGPT-Image-2026-5-1-02_23_19.png'
    },
    {
        slotId: 3,
        slotOrder: 2,
        charmPoints: 2,
        itemAssetName: 'sake_03',
        itemLabel: 'Sake 03',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-e155ac1c-e3f2-414c-8d9b-3b454afc0823-sake02.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-fed18579-b61e-4e96-b3ea-38aedbb1801a-ChatGPT-Image-2026-5-1-02_11_49.png'
    },
    {
        slotId: 4,
        slotOrder: 3,
        charmPoints: 3,
        itemAssetName: 'sake_04',
        itemLabel: 'Sake 04',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-012c5d91-d2d6-4726-8a19-447bfc9ca070-sake03.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-5b3899fd-2738-420f-9069-aa1f7134f55c-ChatGPT-Image-2026-5-1-02_31_22.png'
    },
    {
        slotId: 5,
        slotOrder: 4,
        charmPoints: 3,
        itemAssetName: 'sake_05',
        itemLabel: 'Sake 05',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-793b7fef-4ab2-4d82-bb7d-371961167537-sake05.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-43d08d05-b5ba-4c51-b6ad-d7015306c8f7-ChatGPT-Image-2026-5-1-02_25_06.png'
    },
    {
        slotId: 6,
        slotOrder: 5,
        charmPoints: 4,
        itemAssetName: 'sake_06',
        itemLabel: 'Sake 06',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-34f98da0-a037-4a34-9b00-9018b8da6ff0-sake06.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-2ef254e2-0aad-4286-98d8-c261fc9e33ed-ChatGPT-Image-2026-5-1-02_27_04.png'
    },
    {
        slotId: 7,
        slotOrder: 6,
        charmPoints: 5,
        itemAssetName: 'sake_07',
        itemLabel: 'Sake 07',
        itemImageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-%E9%81%93%E5%85%B7/1777615747526-4f45b398-ff3d-4800-8856-3149f3757229-sake07.png',
        itemIconUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7-ICON/1777617306158-434f9580-6456-45aa-b5df-3d91a36c1a52-ChatGPT-Image-2026-5-1-02_28_43.png'
    }
];

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
