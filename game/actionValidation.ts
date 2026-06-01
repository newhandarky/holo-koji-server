import type { ActionType } from '@newhandarky/hanakoji-game-types';

export type GameActionPayload = {
    type?: unknown;
    actionType?: unknown;
    action?: unknown;
    cards?: unknown;
    cardIds?: unknown;
    cardId?: unknown;
    chosenCardId?: unknown;
    chosenGroupIndex?: unknown;
    groups?: unknown;
};

export type ServerAction = {
    type: string;
    payload?: GameActionPayload;
};

type ActionTokenHolder = {
    actionTokens: Array<{
        type: ActionType;
        used: boolean;
    }>;
};

type CardHolder = {
    hand: Array<{
        id: string;
    }>;
};

export const toStringArray = (value: unknown): string[] => (
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
);

export const toCompetitionGroups = (value: unknown): string[][] => (
    Array.isArray(value)
        ? value.map((group) => toStringArray(group)).filter((group) => group.length > 0)
        : []
);

export const getActionAvailabilityError = (
    player: ActionTokenHolder,
    actionType: ActionType
): string | null => {
    const token = player.actionTokens.find(item => item.type === actionType);
    return !token || token.used ? '該行動已使用或不存在' : null;
};

export const getCardOwnershipError = (
    player: CardHolder,
    cardIds: readonly string[]
): string | null => {
    const uniqueIds = new Set(cardIds);
    if (uniqueIds.size !== cardIds.length) {
        return '卡片選擇重複';
    }

    const handIds = new Set(player.hand.map(card => card.id));
    return cardIds.every(cardId => handIds.has(cardId))
        ? null
        : '選擇的卡片不在你的手牌中';
};

export const getPendingInteractionError = (
    pendingInteraction: unknown,
    actionType: string
): string | null => {
    const isResolveAction = actionType.startsWith('RESOLVE_');

    if (pendingInteraction && !isResolveAction) {
        return '目前正在等待對手回應';
    }

    if (!pendingInteraction && isResolveAction) {
        return '目前沒有等待處理的互動';
    }

    return null;
};
