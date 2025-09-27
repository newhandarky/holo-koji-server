/**
 * @typedef {import('game-shared-types').Geisha} Geisha
 * @typedef {import('game-shared-types').ItemCard} ItemCard
 */

export const geishaNames = ['白上フブキ', '百鬼あやめ', '大神ミオ', 'さくらみこ', '風真いろは', '儒烏風亭らでん', '一伊那尓栖'];
export const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

const baseGeishaData = geishaNames.map((name, index) => ({
    id: index + 1,
    name,
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

export const buildDeckForGeishas = (geishas) => {
    /** @type {ItemCard[]} */
    const cards = [];

    geishas.forEach((geisha) => {
        for (let copy = 0; copy < 3; copy += 1) {
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
