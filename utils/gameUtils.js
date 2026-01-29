/**
 * @typedef {import('game-shared-types').Geisha} Geisha
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 */

export const geishaData = [
    {
        name: '一伊那尓栖',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/07/Ninomae-Inanis_list_thumb.png'
    },
    {
        name: '大神ミオ',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/06/Ookami-Mio_thumb.png'
    },
    {
        name: '百鬼あやめ',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/06/Nakiri-Ayame_list_thumb.png'
    },
    {
        name: '白上フブキ',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/06/Shirakami-Fubuki_list_thumb.png'
    },
    {
        name: 'さくらみこ',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/06/Sakura-Miko_list_thumb.png'
    },
    {
        name: '風真いろは',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2020/07/Kazama-Iroha_list_thumb.png'
    },
    {
        name: '儒烏風亭らでん',
        imageUrl: 'https://hololive.hololivepro.com/wp-content/uploads/2023/09/Juufuutei-Raden_list_thumb.png'
    }
];
export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

const baseGeishaData = geishaData.map((geisha, index) => ({
    id: index + 1,
    name: geisha.name,
    charmPoints: charmPointsDistribution[index]
}));

const shuffleArray = (array) => {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};

export const createBaseGeishas = () => baseGeishaData.map((geisha) => ({
    ...geisha,
    controlledBy: null
}));

export const createRandomizedGeishas = () => shuffleArray(baseGeishaData).map((geisha) => ({
    ...geisha,
    controlledBy: null
}));

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
