import type {
    AchievementCatalogItem,
    AchievementId
} from '@newhandarky/hanakoji-game-types';

export const ACHIEVEMENT_CATALOG: AchievementCatalogItem[] = [
    {
        achievementId: 'first_completed_match',
        title: '初次花見',
        description: '完成第一場對局。',
        conditionType: 'completed_games',
        target: 1
    },
    {
        achievementId: 'first_win',
        title: '初次勝利',
        description: '贏得第一場對局。',
        conditionType: 'wins',
        target: 1
    },
    {
        achievementId: 'complete_3_matches',
        title: '三度赴約',
        description: '完成 3 場對局。',
        conditionType: 'completed_games',
        target: 3
    },
    {
        achievementId: 'win_3_matches',
        title: '三勝之姿',
        description: '贏得 3 場對局。',
        conditionType: 'wins',
        target: 3
    }
];

const achievementIds = new Set<AchievementId>(
    ACHIEVEMENT_CATALOG.map((item) => item.achievementId)
);

export const isAchievementId = (achievementId: unknown): achievementId is AchievementId => (
    typeof achievementId === 'string' && achievementIds.has(achievementId as AchievementId)
);
