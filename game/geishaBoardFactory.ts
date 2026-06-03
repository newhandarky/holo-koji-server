import type {
    CharacterProfile,
    CustomCharacterSelection,
    Geisha
} from '@newhandarky/hanakoji-game-types';
import {
    DEFAULT_GEISHA_SET,
    ginzaBoardSlotDefinitions,
    resolveAssetUrl
} from './geishaSetCatalog.js';
import type { BoardSlotDefinition } from './geishaSetCatalog.js';
import {
    getCharacterPoolForSet,
    normalizeGeishaSet,
    validateCharacterSetData,
    validateCustomCharacterSelection,
    validateGinzaSetupData
} from './geishaSetupRules.js';
import {
    defaultRandomSource,
    shuffleArray,
    type PartialRandomSource
} from './gameRandomSource.js';

interface GeishaCreationOptions {
    randomSource?: PartialRandomSource;
    characterPool?: CharacterProfile[];
    boardSlots?: BoardSlotDefinition[];
    selectedCharacterIds?: string[] | null;
}

interface CustomSelectionValidationOptions {
    characterPool?: CharacterProfile[];
}

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
