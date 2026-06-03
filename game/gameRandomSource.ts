export interface RandomSource {
    nextInt: (maxExclusive: number) => number;
    nextToken: () => string;
}

export type PartialRandomSource = Partial<RandomSource>;

export const defaultRandomSource: RandomSource = {
    nextInt(maxExclusive: number) {
        return Math.floor(Math.random() * maxExclusive);
    },
    nextToken() {
        return Math.random().toString(36).slice(2, 8);
    }
};

export const normalizeRandomSource = (randomSource: PartialRandomSource = {}): RandomSource => ({
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

export const shuffleArray = <T>(array: T[], randomSource: PartialRandomSource = defaultRandomSource): T[] => {
    const source = normalizeRandomSource(randomSource);
    const result = [...array];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = source.nextInt(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};
