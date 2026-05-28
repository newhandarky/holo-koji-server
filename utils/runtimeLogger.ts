type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogContext = Record<string, unknown>;
type UnknownRecord = Record<string, unknown>;

const diagnosticsEnabled = process.env.GAME_DIAGNOSTICS === 'true';

const isRecord = (value: unknown): value is UnknownRecord => (
    Boolean(value) && typeof value === 'object'
);

const sanitizeContext = (context: LogContext = {}) => {
    const entries = Object.entries(context).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const emit = (level: LogLevel, message: string, context?: LogContext) => {
    const safeContext = sanitizeContext(context);

    if (safeContext) {
        console[level](message, safeContext);
        return;
    }

    console[level](message);
};

export const backendLogger = {
    info(message: string, context?: LogContext) {
        emit('info', message, context);
    },
    warn(message: string, context?: LogContext) {
        emit('warn', message, context);
    },
    error(message: string, context?: LogContext) {
        emit('error', message, context);
    },
    diagnostic(message: string, context?: LogContext) {
        if (!diagnosticsEnabled) {
            return;
        }

        emit('debug', message, context);
    }
};

export const isBackendDiagnosticsEnabled = () => diagnosticsEnabled;

export const summarizeWebSocketMessage = (message: unknown) => {
    if (!isRecord(message)) {
        return null;
    }

    const payload = isRecord(message.payload) ? message.payload : null;
    const action = payload && isRecord(payload.action) ? payload.action : null;
    const persistenceStatus = payload && isRecord(payload.persistenceStatus) ? payload.persistenceStatus : null;
    const payloadActionType = action?.type ?? payload?.type ?? null;

    return sanitizeContext({
        type: typeof message.type === 'string' ? message.type : 'unknown',
        roomId: typeof payload?.roomId === 'string' ? payload.roomId : undefined,
        gameId: typeof payload?.gameId === 'string' ? payload.gameId : undefined,
        playerId: typeof payload?.playerId === 'string' ? payload.playerId : undefined,
        accountStatus: message.type === 'ACCOUNT_SYNC_RESULT' && typeof payload?.status === 'string' ? payload.status : undefined,
        accountPersistenceMode: persistenceStatus?.mode === 'durable' || persistenceStatus?.mode === 'temporary'
            ? persistenceStatus.mode
            : undefined,
        achievementStatus: payload?.status === 'available' || payload?.status === 'guest' || payload?.status === 'unavailable'
            ? payload.status
            : undefined,
        achievementNewUnlockCount: typeof payload?.newUnlockCount === 'number' ? payload.newUnlockCount : undefined,
        actionType: typeof payloadActionType === 'string' ? payloadActionType : undefined,
        mode: payload?.mode === 'npc' || payload?.mode === 'online' ? payload.mode : undefined,
        geishaSet: typeof payload?.geishaSet === 'string' ? payload.geishaSet : undefined,
        setupMode: payload?.setupMode === 'random' || payload?.setupMode === 'custom' ? payload.setupMode : undefined,
        hasPayload: Boolean(payload)
    });
};

export const summarizeGameState = (state: unknown) => {
    if (!isRecord(state)) {
        return null;
    }

    const accountPersistenceStatus = isRecord(state.accountPersistenceStatus) ? state.accountPersistenceStatus : null;
    const openingDeal = isRecord(state.openingDeal) ? state.openingDeal : null;

    return sanitizeContext({
        gameId: typeof state.gameId === 'string' ? state.gameId : undefined,
        geishaSet: typeof state.geishaSet === 'string' ? state.geishaSet : undefined,
        setupMode: state.setupMode === 'random' || state.setupMode === 'custom' ? state.setupMode : undefined,
        phase: typeof state.phase === 'string' ? state.phase : undefined,
        round: typeof state.round === 'number' ? state.round : undefined,
        playerCount: Array.isArray(state.players) ? state.players.length : undefined,
        accountPersistenceMode: accountPersistenceStatus?.mode === 'durable' || accountPersistenceStatus?.mode === 'temporary'
            ? accountPersistenceStatus.mode
            : undefined,
        hasPendingInteraction: Boolean(state.pendingInteraction),
        removedCardPresent: state.removedCard ? true : undefined,
        openingDealStatus: typeof openingDeal?.status === 'string' ? openingDeal.status : undefined,
        openingDealReplayable: typeof openingDeal?.replayable === 'boolean' ? openingDeal.replayable : undefined,
        openingDealStepCount: Array.isArray(openingDeal?.steps) ? openingDeal.steps.length : undefined
    });
};
