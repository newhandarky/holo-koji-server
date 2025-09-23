import { Geisha } from "game-shared-types"

const geishaNames = ['白上フブキ', '百鬼あやめ', '大神ミオ', 'さくらみこ', '風真いろは', '儒烏風亭らでん', '一伊那尓栖'];
const charmPointsDistribution = [2, 2, 2, 3, 3, 4, 5];

/**
 * 創建隨機順序的藝妓陣列
 */
export function createRandomizedGeishas(): Geisha[] {
    const shuffledNames = [...geishaNames].sort(() => Math.random() - 0.5);

    return shuffledNames.map((name, index) => ({
        id: index + 1,
        name,
        charmPoints: charmPointsDistribution[index],
        controlledBy: null,
    }));
}
