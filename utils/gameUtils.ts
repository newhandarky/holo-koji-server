import type {
    ActionToken,
    CharacterProfile,
    CustomCharacterSelection,
    GameState,
    Geisha,
    GeishaSet,
    ItemCard,
    OpeningDealSummary,
    OpeningDealStep,
    PendingInteraction,
    Player,
    RoomSetupMode
} from 'game-shared-types';
import { characterProfilesBySet } from './characterProfiles.js';

const DEFAULT_WEB_APP_URL = 'https://newhandarky.github.io/holo-koji';
const assetBaseUrl = (process.env.WEB_APP_URL || process.env.REACT_APP_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');

interface BoardSlotDefinition {
    slotId: number;
    slotOrder: number;
    charmPoints: number;
    itemAssetName: string;
    itemLabel: string;
    itemImageUrl: string;
    itemIconUrl: string;
}

export interface RandomSource {
    nextInt: (maxExclusive: number) => number;
    nextToken: () => string;
}

type PartialRandomSource = Partial<RandomSource>;

interface GeishaCreationOptions {
    randomSource?: PartialRandomSource;
    characterPool?: CharacterProfile[];
    boardSlots?: BoardSlotDefinition[];
    selectedCharacterIds?: string[] | null;
}

interface CustomSelectionValidationOptions {
    characterPool?: CharacterProfile[];
}

interface RestorableSnapshot {
    geishaSet?: unknown;
    setupMode?: unknown;
    customSelection?: CustomCharacterSelection;
    baseGeishas?: Geisha[];
    gameState?: Partial<ServerGameState>;
}

interface RestorableSetOptions {
    isSupportedSet?: (setKey: unknown) => boolean;
}

interface PlayerMeta {
    name?: string;
    lineUserId?: string;
    avatarUrl?: string;
}

export type PlayerMetaMap = Record<string, PlayerMeta | undefined>;

type ServerOrderDecision = Omit<GameState['orderDecision'], 'currentPlayer'> & {
    currentPlayer?: string;
};

type ServerGameState = Omit<GameState, 'removedCard' | 'settlement' | 'orderDecision'> & {
    hostId?: string | null;
    orderDecision: ServerOrderDecision;
    geishaSet?: GeishaSet;
    setupMode?: RoomSetupMode;
    customSelection?: CustomCharacterSelection;
    removedCard?: ItemCard | null;
    settlement?: {
        removedCard?: ItemCard | null;
    };
};

interface VisibleStateOptions {
    geishaSet?: GeishaSet;
}

interface OpeningDealInputStep {
    playerId: string;
}

interface OpeningDealOptions {
    sequenceId?: string;
    status?: 'pending' | 'completed' | 'not_replayable';
    replayable?: boolean;
}

const isGeishaSet = (value: unknown): value is GeishaSet => (
    SUPPORTED_GEISHA_SETS.includes(value as GeishaSet)
);

const isRoomSetupMode = (value: unknown): value is RoomSetupMode => (
    ROOM_SETUP_MODES.includes(value as RoomSetupMode)
);

const resolveAssetUrl = (assetPath?: string): string => {
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

const defaultRandomSource: RandomSource = {
    nextInt(maxExclusive: number) {
        return Math.floor(Math.random() * maxExclusive);
    },
    nextToken() {
        return Math.random().toString(36).slice(2, 8);
    }
};

const normalizeRandomSource = (randomSource: PartialRandomSource = {}): RandomSource => ({
    nextInt: typeof randomSource.nextInt === 'function'
        ? (maxExclusive: number) => randomSource.nextInt?.(maxExclusive) ?? defaultRandomSource.nextInt(maxExclusive)
        : (maxExclusive) => defaultRandomSource.nextInt(maxExclusive),
    nextToken: typeof randomSource.nextToken === 'function'
        ? () => randomSource.nextToken?.() ?? defaultRandomSource.nextToken()
        : () => defaultRandomSource.nextToken()
});

export const createDeterministicRandomSource = (sequence: number[] = []): RandomSource => {
    let cursor = 0;
    return {
        nextInt(maxExclusive: number) {
            const raw = sequence.length > 0 ? sequence[cursor % sequence.length] : 0;
            cursor += 1;
            return Math.abs(raw) % maxExclusive;
        },
        nextToken() {
            const raw = sequence.length > 0 ? sequence[cursor % sequence.length] : cursor;
            cursor += 1;
            return `seed${String(Math.abs(raw)).padStart(4, '0')}`;
        }
    };
};

const shuffleArray = <T>(array: T[], randomSource: PartialRandomSource = defaultRandomSource): T[] => {
    const source = normalizeRandomSource(randomSource);
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = source.nextInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

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

export const validateCustomCharacterSelection = (
    setKey: unknown = DEFAULT_GEISHA_SET,
    customSelection: Partial<CustomCharacterSelection> = {},
    options: CustomSelectionValidationOptions = {}
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

export const sanitizePendingInteractionForViewer = (
    pendingInteraction: PendingInteraction | null | undefined,
    viewerId: string
): PendingInteraction | null => {
    if (!pendingInteraction) {
        return null;
    }

    if (pendingInteraction.targetPlayerId === viewerId) {
        return pendingInteraction;
    }

    if (pendingInteraction.type === 'GIFT_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            offeredCards: []
        };
    }

    if (pendingInteraction.type === 'COMPETITION_SELECTION') {
        return {
            type: pendingInteraction.type,
            initiatorId: pendingInteraction.initiatorId,
            targetPlayerId: pendingInteraction.targetPlayerId,
            groups: []
        };
    }

    return null;
};

const createHiddenCard = (prefix: string, index: number): ItemCard => ({
    id: `hidden-${prefix}-${index}`,
    geishaId: 0,
    type: 'hidden'
});

const createHiddenCards = (count: number, prefix: string): ItemCard[] => Array.from({ length: count }, (_, index) => createHiddenCard(prefix, index));

export const buildPlayerVisibleGameState = (
    gameState: ServerGameState | null | undefined,
    viewerId: string,
    options: VisibleStateOptions = {}
): ServerGameState | null => {
    if (!gameState) {
        return null;
    }

    const activeGeishaSet = gameState.geishaSet ?? options.geishaSet ?? DEFAULT_GEISHA_SET;
    const sanitizedPlayers = (gameState.players ?? []).map((player): Player => {
        if (player.id === viewerId) {
            return player;
        }

        return {
            ...player,
            hand: createHiddenCards(player.hand?.length ?? 0, `${player.id}-hand`),
            secretCards: [],
            discardedCards: createHiddenCards(player.discardedCards?.length ?? 0, `${player.id}-discard`)
        };
    });

    return {
        ...gameState,
        geishaSet: activeGeishaSet,
        players: sanitizedPlayers,
        drawPile: [],
        removedCard: null,
        settlement: gameState.phase === 'ended'
            ? {
                ...(gameState.settlement ?? {}),
                ...(gameState.removedCard ? { removedCard: gameState.removedCard } : {})
            }
            : undefined,
        pendingInteraction: sanitizePendingInteractionForViewer(gameState.pendingInteraction, viewerId)
    };
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

const createGeishasForSet = (setKey: unknown = DEFAULT_GEISHA_SET, options: GeishaCreationOptions = {}): Geisha[] => {
    const {
        randomSource = defaultRandomSource,
        characterPool = getCharacterPoolForSet(setKey),
        boardSlots = ginzaBoardSlotDefinitions,
        selectedCharacterIds = null
    } = options;

    const activeSet = normalizeGeishaSet(setKey);
    validateCharacterSetData(activeSet, characterPool);
    validateGinzaSetupData(characterPool, boardSlots);

    const selectedCharacters: CharacterProfile[] = selectedCharacterIds
        ? validateCustomCharacterSelection(activeSet, { characterIds: selectedCharacterIds }, { characterPool }).characterIds
            .map((characterId) => {
                const character = characterPool.find((candidate) => candidate.characterId === characterId);
                if (!character) {
                    throw new Error(`Custom character selection contains a missing character: ${characterId}`);
                }
                return character;
            })
        : shuffleArray(characterPool, randomSource).slice(0, 7);
    const boardCharacters = shuffleArray(selectedCharacters, randomSource);
    const orderedSlots = [...boardSlots].sort((a, b) => a.slotOrder - b.slotOrder);

    return orderedSlots.map((slot, index) => {
        const character = boardCharacters[index];
        return {
            id: slot.slotId,
            characterId: character.characterId,
            boardSlotId: slot.slotId,
            name: character.name,
            imageUrl: resolveAssetUrl(character.imageUrl),
            charmPoints: slot.charmPoints,
            controlledBy: null
        };
    });
};

export const createBaseGeishas = (setKey: unknown = DEFAULT_GEISHA_SET, options: GeishaCreationOptions = {}): Geisha[] => createGeishasForSet(setKey, options);

export const createRandomizedGeishas = (setKey: unknown = DEFAULT_GEISHA_SET, options: GeishaCreationOptions = {}): Geisha[] => createBaseGeishas(setKey, options);

export const createCustomSelectedGeishas = (
    setKey: unknown = DEFAULT_GEISHA_SET,
    customSelection: Partial<CustomCharacterSelection> = {},
    options: GeishaCreationOptions & CustomSelectionValidationOptions = {}
): Geisha[] => {
    const validatedSelection = validateCustomCharacterSelection(setKey, customSelection, options);
    return createBaseGeishas(setKey, {
        ...options,
        selectedCharacterIds: validatedSelection.characterIds
    });
};

export const cloneGeishas = (geishas: Geisha[] = []): Geisha[] => geishas.map((geisha) => ({ ...geisha }));

export const cloneGeishasForNextRound = (geishas: Geisha[] = []): Geisha[] => geishas.map((geisha) => ({ ...geisha }));

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
                    firstPlayer: orderedPlayerIds[0],
                    secondPlayer: orderedPlayerIds[1],
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

const buildGinzaCardForGeisha = (
    geisha: Geisha,
    copy: number,
    randomSource: PartialRandomSource = defaultRandomSource
): ItemCard => {
    const source = normalizeRandomSource(randomSource);
    const boardSlot = ginzaBoardSlotDefinitions.find((slot) => slot.slotId === geisha.boardSlotId);
    if (!boardSlot) {
        throw new Error(`Missing Ginza board slot definition for slot ${geisha.boardSlotId}`);
    }

    return {
        id: `card-${geisha.id}-${copy}-${source.nextToken()}`,
        geishaId: geisha.id,
        type: boardSlot.itemAssetName,
        boardSlotId: boardSlot.slotId,
        itemAssetName: boardSlot.itemAssetName,
        itemLabel: boardSlot.itemLabel,
        itemImageUrl: boardSlot.itemImageUrl,
        itemIconUrl: boardSlot.itemIconUrl
    };
};

export const buildDeckForGeishas = (
    geishas: Geisha[],
    options: { randomSource?: PartialRandomSource } = {}
): { deck: ItemCard[]; removedCard: ItemCard | null } => {
    const { randomSource = defaultRandomSource } = options;
    const cards: ItemCard[] = [];

    geishas.forEach((geisha) => {
        const copies = geisha.charmPoints ?? 0;
        for (let copy = 0; copy < copies; copy += 1) {
            if (!geisha.boardSlotId) {
                throw new Error(`Missing boardSlotId for geisha ${geisha.id}`);
            }
            cards.push(buildGinzaCardForGeisha(geisha, copy, randomSource));
        }
    });

    const shuffled = shuffleArray(cards, randomSource);
    const removedCard = shuffled.pop() ?? null;

    return {
        deck: shuffled,
        removedCard
    };
};

export const buildOpeningDealSummary = (dealSequence: OpeningDealInputStep[] = [], options: OpeningDealOptions = {}): OpeningDealSummary => {
    const {
        sequenceId = 'opening-deal',
        status = 'completed',
        replayable = true
    } = options;
    const cardIndexesByPlayer = new Map<string, number>();
    const steps: OpeningDealStep[] = [
        {
            type: 'BURN_HIDDEN_CARD',
            order: 0,
            targetZone: 'hidden-reserve'
        }
    ];

    dealSequence.forEach((step) => {
        const currentIndex = (cardIndexesByPlayer.get(step.playerId) ?? 0) + 1;
        cardIndexesByPlayer.set(step.playerId, currentIndex);
        steps.push({
            type: 'DEAL_CARD_BACK',
            order: steps.length,
            targetPlayerId: step.playerId,
            cardIndex: currentIndex
        });
    });

    steps.push({
        type: 'OPENING_DEAL_COMPLETE',
        order: steps.length
    });

    return {
        sequenceId,
        status,
        completed: status === 'completed' || status === 'not_replayable',
        replayable,
        steps
    };
};

export const markOpeningDealNotReplayable = (openingDeal?: OpeningDealSummary): OpeningDealSummary | undefined => {
    if (!openingDeal) {
        return openingDeal;
    }

    return {
        ...openingDeal,
        status: 'not_replayable',
        replayable: false,
        completed: true,
        steps: Array.isArray(openingDeal.steps)
            ? openingDeal.steps.map((step) => ({ ...step }))
            : []
    };
};
