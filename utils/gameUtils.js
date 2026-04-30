/**
 * @typedef {import('game-shared-types').Geisha} Geisha
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 */

const DEFAULT_WEB_APP_URL = 'https://newhandarky.github.io/holo-koji';
const assetBaseUrl = (process.env.WEB_APP_URL || process.env.REACT_APP_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');

const resolveAssetUrl = (assetPath) => {
    if (!assetPath) {
        return '';
    }

    if (/^https?:\/\//i.test(assetPath)) {
        return assetPath;
    }

    const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
    return `${assetBaseUrl}${normalizedPath}`;
};

// 藝妓資料（後端初始化用）
export const geishaData = [
    {
        name: 'レイナ',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514766694-d3a46d91-d1dc-4b06-8608-1fcf0e24e3f1-2026-4-27-12_09_31.png'
    },
    {
        name: 'ミサキ',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514743942-46f8cae1-0e25-4945-9799-da9a6a945861-ChatGPT-Image-2026-4-27-05_24_29.png'
    },
    {
        name: 'ユア',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514010037-779cd6f7-9e8d-419d-be7c-ecd6b9188475-ChatGPT-Image-2026-4-27-01_36_43.png'
    },
    {
        name: 'エマ',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514023282-13e5dd2e-6017-4531-9fb8-ddfa16d438d3-ChatGPT-Image-2026-4-27-01_55_46.png'
    },
    {
        name: 'リオ',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514743626-7dd8f5f0-af8e-49e4-85d3-6c3c4a554aff-ChatGPT-Image-2026-4-27-08_07_23.png'
    },
    {
        name: 'アヤ',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514743581-1c5b41e2-820e-4eb4-b582-408da535f670-ChatGPT-Image-2026-4-27-05_34_17.png'
    },
    {
        name: 'ノア',
        imageUrl: 'https://pub-0238f59b333e4bf38dac0e35da86c1a0.r2.dev/uploads/%E9%8A%80%E5%BA%A7/1777514743625-57718cc2-612b-4914-935f-56969d3fa1b9-ChatGPT-Image-2026-4-27-05_54_16.png'
    }
];

export const akatsukiGeishaData = [
    {
        name: '火威青',
        imageUrl: '/images/geisha/akatsuki/ao.jpg'
    },
    {
        name: '潤羽るしあ',
        imageUrl: '/images/geisha/akatsuki/lushia.jpg'
    },
    {
        name: '沙花叉クロヱ',
        imageUrl: '/images/geisha/akatsuki/sakamata.jpg'
    },
    {
        name: 'Gawr Gura',
        imageUrl: '/images/geisha/akatsuki/gura.jpg'
    },
    {
        name: '湊あくあ',
        imageUrl: '/images/geisha/akatsuki/aqua.jpg'
    },
    {
        name: '天音かなた',
        imageUrl: '/images/geisha/akatsuki/kanata.jpg'
    },
    {
        name: '桐生ココ',
        imageUrl: '/images/geisha/akatsuki/coco.png'
    }
];

export const onesanGeishaData = [
    {
        name: 'アキ・ローゼンタール',
        imageUrl: '/images/geisha/onesan/aki.jpg'
    },
    {
        name: '癒月ちょこ',
        imageUrl: '/images/geisha/onesan/choko.jpg'
    },
    {
        name: 'ときのそら',
        imageUrl: '/images/geisha/onesan/sora.jpg'
    },
    {
        name: 'Mori Calliope',
        imageUrl: '/images/geisha/onesan/cali.jpg'
    },
    {
        name: 'AZKi',
        imageUrl: '/images/geisha/onesan/azki.jpg'
    },
    {
        name: 'Elizabeth Rose Bloodflame',
        imageUrl: '/images/geisha/onesan/Elizabeth.jpg'
    },
    {
        name: 'Nerissa Ravencroft',
        imageUrl: '/images/geisha/onesan/Nerissa.png'
    }
];

export const collaborationGeishaData = [
    {
        name: 'アキ・ローゼンタール',
        imageUrl: '/images/geisha/collaboration/marin.jpg'
    },
    {
        name: '癒月ちょこ',
        imageUrl: '/images/geisha/collaboration/ren.jpg'
    },
    {
        name: 'ときのそら',
        imageUrl: '/images/geisha/collaboration/yoru.jpg'
    },
    {
        name: 'Mori Calliope',
        imageUrl: '/images/geisha/collaboration/megumin.jpg'
    },
    {
        name: 'AZKi',
        imageUrl: '/images/geisha/collaboration/arima.jpg'
    },
    {
        name: 'Elizabeth Rose Bloodflame',
        imageUrl: '/images/geisha/collaboration/furiren.jpg'
    },
    {
        name: 'Nerissa Ravencroft',
        imageUrl: '/images/geisha/collaboration/erien.jpg'
    }
];

const geishaSetMap = {
    default: geishaData,
    akatsuki: akatsukiGeishaData,
    onesan: onesanGeishaData,
    collaboration: collaborationGeishaData
};
// 魅力值分布（對應藝妓順序）
export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

// 建立藝妓基礎資料（含固定魅力值）
const buildBaseGeishaData = (setKey = 'default') => {
    const data = geishaSetMap[setKey] ?? geishaData;
    return data.map((geisha, index) => ({
        id: index + 1,
        name: geisha.name,
        imageUrl: resolveAssetUrl(geisha.imageUrl),
        charmPoints: charmPointsDistribution[index]
    }));
};

// 洗牌工具（Fisher-Yates）
const shuffleArray = (array) => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

// 取得固定順序的藝妓資料
export const createBaseGeishas = (setKey = 'default') =>
    buildBaseGeishaData(setKey).map((geisha) => ({
        ...geisha,
        controlledBy: null
    }));

// 取得固定順序的藝妓資料（依 index 對應魅力值）
export const createRandomizedGeishas = (setKey = 'default') => createBaseGeishas(setKey);

// 根據藝妓魅力值建立牌庫（每位藝妓的卡牌數量等於魅力值）
export const buildDeckForGeishas = (geishas) => {
    /** @type {ItemCard[]} */
    const cards = [];

    geishas.forEach((geisha) => {
        const copies = geisha.charmPoints ?? 0;
        for (let copy = 0; copy < copies; copy += 1) {
            cards.push({
                id: `card-${geisha.id}-${copy}-${Math.random().toString(36).slice(2, 8)}`,
                geishaId: geisha.id,
                type: `geisha-${geisha.id}`
            });
        }
    });

    const shuffled = shuffleArray(cards);
    const removedCard = shuffled.pop() ?? null;

    return {
        deck: shuffled,
        removedCard
    };
};
