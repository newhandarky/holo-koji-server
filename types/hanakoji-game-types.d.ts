declare module '@newhandarky/hanakoji-game-types' {
    export type PlayerId = 'player1' | 'player2';

    export interface Geisha {
        id: number;
        characterId?: string;
        boardSlotId?: number;
        name: string;
        charmPoints: number;
        imageUrl: string;
        controlledBy: string | null;
    }

    export interface ItemCard {
        id: string;
        geishaId: number;
        type: string;
        boardSlotId?: number;
        itemAssetName?: string;
        itemLabel?: string;
        itemImageUrl?: string;
        itemIconUrl?: string;
    }

    export type ActionType = 'secret' | 'trade-off' | 'gift' | 'competition';
    export type GamePhase = 'waiting' | 'deciding_order' | 'playing' | 'resolution' | 'ended';

    export interface ActionToken {
        type: ActionType;
        used: boolean;
    }

    export interface Player {
        id: string;
        name: string;
        lineUserId?: string;
        avatarUrl?: string;
        hand: ItemCard[];
        playedCards: ItemCard[];
        secretCards: ItemCard[];
        discardedCards: ItemCard[];
        actionTokens: ActionToken[];
        score: {
            charm: number;
            tokens: number;
        };
    }

    export interface PendingGiftInteraction {
        type: 'GIFT_SELECTION';
        initiatorId: string;
        targetPlayerId: string;
        offeredCards?: ItemCard[];
    }

    export interface PendingCompetitionInteraction {
        type: 'COMPETITION_SELECTION';
        initiatorId: string;
        targetPlayerId: string;
        groups?: ItemCard[][];
    }

    export type PendingInteraction = PendingGiftInteraction | PendingCompetitionInteraction;

    export interface OrderDecision {
        isOpen: boolean;
        phase: 'deciding' | 'result' | 'waiting_confirmation';
        players: string[];
        result?: {
            firstPlayer: string;
            secondPlayer: string;
            order: string[];
        };
        confirmations: string[];
        waitingFor: string[];
        currentPlayer: string;
    }

    export type OpeningDealStep = {
        type: 'BURN_HIDDEN_CARD';
        order: number;
        targetZone: 'hidden-reserve';
    } | {
        type: 'DEAL_CARD_BACK';
        order: number;
        targetPlayerId: string;
        cardIndex: number;
    } | {
        type: 'OPENING_DEAL_COMPLETE';
        order: number;
    };

    export interface OpeningDealSummary {
        sequenceId: string;
        status: 'pending' | 'completed' | 'not_replayable';
        steps: OpeningDealStep[];
        completed: boolean;
        replayable: boolean;
    }

    export type GeishaSet = 'default' | 'collaboration' | 'hololive';
    export type RoomSetupMode = 'random' | 'custom';

    export interface CharacterProfile {
        characterId: string;
        name: string;
        imageUrl: string;
    }

    export const characterProfilesBySet: Record<GeishaSet, CharacterProfile[]>;

    export interface CustomCharacterSelection {
        characterIds: string[];
    }

    export interface VerifiedLineIdentity {
        provider: 'line';
        lineUserId: string;
        verifiedAt: string;
        source: string;
    }

    export interface MinimalAccountCounters {
        gamesPlayed: number;
        wins: number;
        lastPlayedAt: string | null;
    }

    export interface LineAccountProfile {
        lineUserId: string;
        displayName: string;
        avatarUrl?: string;
        createdAt: string;
        updatedAt: string;
        counters: MinimalAccountCounters;
    }

    export interface AccountPersistenceStatus {
        mode: 'durable' | 'temporary';
        available: boolean;
        message: string;
    }

    export type AccountSyncStatus = 'bound' | 'guest' | 'sync-failed' | 'unverified';

    export interface AccountSyncResult {
        status: AccountSyncStatus;
        profile?: LineAccountProfile;
        persistenceStatus: AccountPersistenceStatus;
        guestNotice?: string;
    }

    export interface AccountSyncRequest {
        verifiedIdentity?: VerifiedLineIdentity;
        idToken?: string;
        authorizationCode?: string;
        redirectUri?: string;
        profile?: {
            displayName?: string;
            avatarUrl?: string;
        };
    }

    export type AchievementId = 'first_completed_match' | 'first_win' | 'complete_3_matches' | 'win_3_matches';
    export type AchievementConditionType = 'completed_games' | 'wins';
    export type AchievementItemState = 'locked' | 'in_progress' | 'unlocked';
    export type AchievementStatus = 'available' | 'guest' | 'unavailable';

    export interface AchievementCatalogItem {
        achievementId: AchievementId;
        title: string;
        description: string;
        conditionType: AchievementConditionType;
        target: number;
    }

    export interface AchievementSummaryItem {
        achievementId: AchievementId;
        title: string;
        description: string;
        state: AchievementItemState;
        currentValue: number;
        target: number;
        unlockedAt?: string;
        isNew: boolean;
    }

    export interface AchievementStatusResult {
        status: AchievementStatus;
        persistenceStatus: AccountPersistenceStatus;
        message?: string;
        newUnlockCount?: number;
        items?: AchievementSummaryItem[];
        generatedAt?: string;
    }

    export interface AchievementAcknowledgeRequest {
        achievementIds?: AchievementId[];
    }

    export interface CreateRoomPayload {
        playerId: string;
        displayName?: string;
        lineUserId?: string;
        avatarUrl?: string;
        mode?: 'online' | 'npc';
        aiDifficulty?: 'easy' | 'medium' | 'hard' | 'expert' | 'hell';
        geishaSet?: GeishaSet;
        setupMode?: RoomSetupMode;
        customSelection?: CustomCharacterSelection;
    }

    export interface JoinRoomPayload {
        roomId: string;
        playerId: string;
        displayName?: string;
        lineUserId?: string;
        avatarUrl?: string;
        roomSessionToken?: string;
    }

    export interface RoomCreatedPayload {
        roomId: string;
        playerId: string;
        roomSessionToken?: string;
    }

    export interface PlayerJoinedPayload {
        roomId: string;
        playerId: string;
        roomSessionToken?: string;
    }

    export type KnownWebSocketErrorCode =
        | 'INVALID_JOIN_REQUEST'
        | 'ROOM_RESTORE_FAILED'
        | 'ROOM_NOT_FOUND'
        | 'ROOM_CONFIG_INVALID'
        | 'ROOM_ALREADY_STARTED'
        | 'PLAYER_ID_TAKEN'
        | 'ROOM_FULL';

    export interface GameState {
        gameId: string;
        players: Player[];
        geishas: Geisha[];
        geishaSet?: GeishaSet;
        currentPlayer: number;
        phase: GamePhase;
        round: number;
        winner?: string;
        orderDecision: OrderDecision;
        drawPile: ItemCard[];
        discardPile: ItemCard[];
        removedCard?: ItemCard;
        openingDeal?: OpeningDealSummary;
        settlement?: {
            removedCard?: ItemCard;
        };
        pendingInteraction: PendingInteraction | null;
        lastAction?: {
            playerId: string;
            action: ActionType;
        };
    }

    export type GameAction = {
        type: 'INIT_GAME';
        payload: {
            gameId: string;
            players: Player[];
        };
    } | {
        type: 'DRAW_CARD';
        payload: {
            playerId: string;
            card: ItemCard;
        };
    } | {
        type: 'PLAY_ACTION';
        payload: {
            playerId: string;
            action: ActionToken;
            cards: ItemCard[];
        };
    } | {
        type: 'SCORE_ROUND';
        payload: {
            scores: {
                playerId: string;
                points: number;
            }[];
        };
    } | {
        type: 'END_TURN';
    } | {
        type: 'END_GAME';
        payload: {
            winner: string;
        };
    } | {
        type: 'SYNC_SERVER_STATE';
        payload: GameState;
    } | {
        type: 'START_ORDER_DECISION';
        payload: {
            players: string[];
        };
    } | {
        type: 'ORDER_DECISION_RESULT';
        payload: {
            firstPlayer: string;
            secondPlayer: string;
            order: string[];
        };
    } | {
        type: 'UPDATE_ORDER_CONFIRMATIONS';
        payload: {
            confirmations: string[];
            waitingFor: string[];
        };
    } | {
        type: 'PLAY_SECRET';
        payload: {
            playerId: string;
            cardId: string;
        };
    } | {
        type: 'PLAY_TRADE_OFF';
        payload: {
            playerId: string;
            cardIds: string[];
        };
    } | {
        type: 'INITIATE_GIFT';
        payload: {
            playerId: string;
            cardIds: string[];
        };
    } | {
        type: 'RESOLVE_GIFT';
        payload: {
            playerId: string;
            chosenCardId: string;
        };
    } | {
        type: 'INITIATE_COMPETITION';
        payload: {
            playerId: string;
            groups: string[][];
        };
    } | {
        type: 'RESOLVE_COMPETITION';
        payload: {
            playerId: string;
            chosenGroupIndex: number;
        };
    } | {
        type: 'COMPLETE_ROUND';
    };

    export interface RoomInfo {
        roomId: string;
        players: string[];
        maxPlayers: number;
        gameState: 'waiting' | 'playing' | 'ended';
    }

    export type WebSocketEventType =
        | 'GAME_STATE_SYNC'
        | 'ORDER_DECISION_STARTED'
        | 'ORDER_DECISION_COMPLETED'
        | 'TURN_CHANGED'
        | 'PLAYER_JOINED'
        | 'ERROR'
        | 'ORDER_DECISION_START'
        | 'GAME_STARTED'
        | 'GAME_STATE_UPDATED'
        | 'GAME_STATE_UPDATE'
        | 'ORDER_CONFIRMATION_UPDATE'
        | 'ORDER_CONFIRMATIONS_UPDATED'
        | 'PLAYER_LEFT'
        | 'ORDER_DECISION_RESULT'
        | 'TURN_ENDED'
        | 'GAME_ENDED'
        | 'ROOM_CREATED'
        | 'ORDER_CONFIRMED'
        | 'STATE_CHANGED'
        | 'DEAL_ANIMATION'
        | 'CARD_DRAWN'
        | 'ACTION_EXECUTED'
        | 'PENDING_INTERACTION'
        | 'INTERACTION_RESOLVED'
        | 'ROUND_COMPLETE'
        | 'READY_CHECK'
        | 'READY_STATUS'
        | 'REMATCH_REQUESTED'
        | 'ACCOUNT_SYNC_RESULT'
        | 'ACHIEVEMENT_STATUS_RESULT';

    export interface WebSocketMessage<T = unknown> {
        type: WebSocketEventType | string;
        payload: T;
    }

    export interface GameStartedPayload {
        gameState: GameState;
        message?: string;
    }

    export interface OrderDecisionStartPayload {
        players: string[];
        gameState: GameState;
    }

    export interface OrderDecisionResultPayload {
        firstPlayer: string;
        secondPlayer: string;
        order: string[];
        gameState?: GameState;
    }

    export interface ErrorPayload {
        code?: KnownWebSocketErrorCode | (string & {});
        message: string;
        details?: unknown;
    }

    export type EmptyPayload = Record<string, never>;

    export interface GameActionRequestPayload {
        gameId: string;
        playerId: string;
        action: GameAction;
    }

    export interface PlayerRoomRequestPayload {
        gameId: string;
        playerId: string;
    }

    export interface ReadyStatusPayload {
        confirmations: string[];
        waitingFor: string[];
    }

    export interface RematchRequestedPayload {
        confirmations: string[];
    }

    export interface CardDrawnPayload {
        playerId: string;
        card: ItemCard;
    }

    export interface DealAnimationPayload {
        sequence: Array<{
            order: number;
            playerId: string;
            card: ItemCard;
        }>;
    }

    export interface RoundCompletePayload {
        round?: number;
    }

    export interface GameEndedPayload {
        winner: string;
    }

    export interface ActionExecutedPayload {
        playerId: string;
        action: ActionType;
        cardIds?: string[];
    }

    export interface InteractionResolvedPayload {
        interaction: PendingInteraction['type'];
        initiatorId: string;
        targetPlayerId: string;
        chosenCardId?: string;
        chosenGroupIndex?: number;
    }

    export interface ClientToServerEventMap {
        ACCOUNT_SYNC: AccountSyncRequest;
        ACCOUNT_STATUS: EmptyPayload;
        ACHIEVEMENT_STATUS: EmptyPayload;
        ACHIEVEMENT_ACK_NEW_UNLOCKS: AchievementAcknowledgeRequest;
        CREATE_ROOM: CreateRoomPayload;
        JOIN_ROOM: JoinRoomPayload;
        CONFIRM_ORDER: PlayerRoomRequestPayload;
        GAME_ACTION: GameActionRequestPayload;
        READY_CONFIRM: PlayerRoomRequestPayload;
        REMATCH_REQUEST: PlayerRoomRequestPayload;
        LEAVE_ROOM: EmptyPayload;
    }

    export interface ServerToClientEventMap {
        ACCOUNT_SYNC_RESULT: AccountSyncResult;
        ACHIEVEMENT_STATUS_RESULT: AchievementStatusResult;
        ERROR: ErrorPayload | string;
        ROOM_CREATED: RoomCreatedPayload;
        PLAYER_JOINED: PlayerJoinedPayload;
        PLAYER_LEFT: {
            playerId: string;
        };
        GAME_STARTED: GameState;
        GAME_STATE_SYNC: GameState;
        GAME_STATE_UPDATED: GameState;
        GAME_STATE_UPDATE: GameState;
        STATE_CHANGED: GameState;
        ORDER_DECISION_START: OrderDecisionStartPayload;
        ORDER_DECISION_STARTED: OrderDecisionStartPayload;
        ORDER_DECISION_RESULT: OrderDecisionResultPayload;
        ORDER_DECISION_COMPLETED: OrderDecisionResultPayload;
        ORDER_CONFIRMATION_UPDATE: ReadyStatusPayload;
        ORDER_CONFIRMATIONS_UPDATED: ReadyStatusPayload;
        ORDER_CONFIRMED: ReadyStatusPayload;
        READY_CHECK: ReadyStatusPayload;
        READY_STATUS: ReadyStatusPayload;
        REMATCH_REQUESTED: RematchRequestedPayload;
        DEAL_ANIMATION: DealAnimationPayload;
        CARD_DRAWN: CardDrawnPayload;
        ACTION_EXECUTED: ActionExecutedPayload;
        PENDING_INTERACTION: PendingInteraction;
        INTERACTION_RESOLVED: InteractionResolvedPayload;
        ROUND_COMPLETE: RoundCompletePayload;
        TURN_CHANGED: GameState;
        TURN_ENDED: GameState;
        GAME_ENDED: GameEndedPayload | GameState;
    }

    export type ClientToServerEventType = keyof ClientToServerEventMap;
    export type ServerToClientEventType = keyof ServerToClientEventMap;
    export type TypedWebSocketMessage<TEventMap extends object> = {
        [K in keyof TEventMap]: {
            type: K;
            payload: TEventMap[K];
        };
    }[keyof TEventMap];
    export type ClientToServerMessage = TypedWebSocketMessage<ClientToServerEventMap>;
    export type ServerToClientMessage = TypedWebSocketMessage<ServerToClientEventMap>;

    export type ClientAction = {
        type: 'SYNC_SERVER_STATE';
        payload: GameState;
    } | {
        type: 'SET_CONNECTION_STATUS';
        payload: {
            isConnected: boolean;
        };
    } | {
        type: 'SET_ERROR';
        payload: {
            error: string;
        };
    } | {
        type: 'CLEAR_ERROR';
    } | {
        type: 'SET_LOADING';
        payload: {
            isLoading: boolean;
        };
    };

    export interface ClientState {
        gameState: GameState;
        isConnected: boolean;
        isLoading: boolean;
        error: string | null;
    }
}
