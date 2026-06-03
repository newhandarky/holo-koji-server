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

export {
    getCharacterPoolForSet,
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode,
    validateCharacterSetData,
    validateCustomCharacterSelection,
    validateGinzaSetupData
} from './geishaSetupRules.js';

export {
    resolveRestorableBoardForSet,
    resolveRestorableGeishaSet,
    validateMatchBoardForCustomSelection,
    validateMatchBoardForSet
} from './geishaBoardRestoreRules.js';
