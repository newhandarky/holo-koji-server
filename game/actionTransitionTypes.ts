import type {
    ItemCard,
    OpeningDealSummary,
    PendingInteraction,
    Player
} from '@newhandarky/hanakoji-game-types';

type TransitionFailure = {
    ok: false;
    errorMessage: string;
};

type TransitionSuccess<T> = {
    ok: true;
    value: T;
};

export type TransitionResult<T> = TransitionFailure | TransitionSuccess<T>;

export type PlayerActionTransition = {
    player: Player;
    openingDeal?: OpeningDealSummary;
    revealedCardIds: string[];
};

export type InteractionInitiationTransition = {
    player: Player;
    openingDeal?: OpeningDealSummary;
    pendingInteraction: PendingInteraction;
};

export type InteractionResolutionTransition = {
    players: Player[];
    pendingInteraction: null;
    initiatorId: string;
    targetPlayerId: string;
};

export type CardSelection = readonly ItemCard[];
