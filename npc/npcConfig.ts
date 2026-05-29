export const NPC_DIFFICULTY_LABEL = {
    easy: 'しぐれうい',
    medium: '大空スバル',
    hard: '兎田ぺこら',
    expert: '猫又おかゆ',
    hell: 'ときのそら'
} as const;

export type NpcDifficulty = keyof typeof NPC_DIFFICULTY_LABEL;

export const NPC_THINKING_DELAY: Record<NpcDifficulty, number> = {
    easy: 1400,
    medium: 1000,
    hard: 700,
    expert: 500,
    hell: 350
};

export const normalizeNpcDifficulty = (difficulty: unknown): NpcDifficulty => {
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard' || difficulty === 'expert' || difficulty === 'hell') {
        return difficulty;
    }
    return 'easy';
};

export const getNpcDifficultyLabel = (difficulty: NpcDifficulty): string => (
    NPC_DIFFICULTY_LABEL[difficulty] ?? NPC_DIFFICULTY_LABEL.easy
);

export const getNpcThinkingDelay = (difficulty: NpcDifficulty | null | undefined): number => (
    NPC_THINKING_DELAY[difficulty ?? 'easy'] ?? NPC_THINKING_DELAY.easy
);
