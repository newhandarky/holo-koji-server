/**
 * @typedef {import('game-shared-types').Geisha} Geisha
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 */

// 藝妓資料（後端初始化用）
export const geishaData = [
    {
        name: '一伊那尓栖',
        imageUrl: '/images/geisha/origin/ninomae-inanis.jpg'
    },
    {
        name: '大神ミオ',
        imageUrl: '/images/geisha/origin/ookami-mio.jpg'
    },
    {
        name: '百鬼あやめ',
        imageUrl: '/images/geisha/origin/nakiri-ayame.jpg'
    },
    {
        name: '白上フブキ',
        imageUrl: '/images/geisha/origin/shirakami-fubuki.jpg'
    },
    {
        name: 'さくらみこ',
        imageUrl: '/images/geisha/origin/sakura-miko.jpg'
    },
    {
        name: '風真いろは',
        imageUrl: '/images/geisha/origin/kazama-iroha.jpg'
    },
    {
        name: '儒烏風亭らでん',
        imageUrl: '/images/geisha/origin/juufuutei-raden.jpg'
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

const geishaSetMap = {
    default: geishaData,
    akatsuki: akatsukiGeishaData
};
// 魅力值分布（對應藝妓順序）
export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

// 建立藝妓基礎資料（含固定魅力值）
const buildBaseGeishaData = (setKey = 'default') => {
    const data = geishaSetMap[setKey] ?? geishaData;
    return data.map((geisha, index) => ({
        id: index + 1,
        name: geisha.name,
        imageUrl: geisha.imageUrl,
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
