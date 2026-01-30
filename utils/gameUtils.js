/**
 * @typedef {import('game-shared-types').Geisha} Geisha
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 */

// 藝妓資料（後端初始化用）
export const geishaData = [
    {
        name: '一伊那尓栖',
        imageUrl: '/images/geisha/ninomae-inanis.jpg'
    },
    {
        name: '大神ミオ',
        imageUrl: '/images/geisha/ookami-mio.jpg'
    },
    {
        name: '百鬼あやめ',
        imageUrl: '/images/geisha/nakiri-ayame.jpg'
    },
    {
        name: '白上フブキ',
        imageUrl: '/images/geisha/shirakami-fubuki.jpg'
    },
    {
        name: 'さくらみこ',
        imageUrl: '/images/geisha/sakura-miko.jpg'
    },
    {
        name: '風真いろは',
        imageUrl: '/images/geisha/kazama-iroha.jpg'
    },
    {
        name: '儒烏風亭らでん',
        imageUrl: '/images/geisha/juufuutei-raden.jpg'
    }
];
// 魅力值分布（對應藝妓順序）
export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

// 建立藝妓基礎資料（含固定魅力值）
const baseGeishaData = geishaData.map((geisha, index) => ({
    id: index + 1,
    name: geisha.name,
    charmPoints: charmPointsDistribution[index]
}));

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
export const createBaseGeishas = () => baseGeishaData.map((geisha) => ({
    ...geisha,
    controlledBy: null
}));

// 取得隨機順序 + 隨機魅力值對應的藝妓資料（僅用於新遊戲）
export const createRandomizedGeishas = () => {
    const shuffledGeishas = shuffleArray(geishaData);
    const shuffledCharm = shuffleArray(charmPointsDistribution);

    return shuffledGeishas.map((geisha, index) => ({
        id: index + 1,
        name: geisha.name,
        charmPoints: shuffledCharm[index],
        controlledBy: null
    }));
};

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
                type: `geisha-${geisha.id}`,
                charmPoints: geisha.charmPoints
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
