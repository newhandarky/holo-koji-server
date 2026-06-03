import type { GeishaSet, RoomSetupMode } from '@newhandarky/hanakoji-game-types';
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
