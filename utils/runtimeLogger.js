const diagnosticsEnabled = process.env.GAME_DIAGNOSTICS === 'true';

const sanitizeContext = (context = {}) => {
    const entries = Object.entries(context).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const emit = (level, message, context) => {
    const safeContext = sanitizeContext(context);

    if (safeContext) {
        console[level](message, safeContext);
        return;
    }

    console[level](message);
};

export const backendLogger = {
    info(message, context) {
        emit('info', message, context);
    },
    warn(message, context) {
        emit('warn', message, context);
    },
    error(message, context) {
        emit('error', message, context);
    },
    diagnostic(message, context) {
        if (!diagnosticsEnabled) {
            return;
        }

        emit('debug', message, context);
    }
};

export const isBackendDiagnosticsEnabled = () => diagnosticsEnabled;

export const summarizeWebSocketMessage = (message) => {
    if (!message || typeof message !== 'object') {
        return null;
    }

    const payload = message.payload;
    const payloadActionType = payload?.action?.type ?? payload?.type ?? null;

    return sanitizeContext({
        type: typeof message.type === 'string' ? message.type : 'unknown',
        roomId: typeof payload?.roomId === 'string' ? payload.roomId : undefined,
        gameId: typeof payload?.gameId === 'string' ? payload.gameId : undefined,
        playerId: typeof payload?.playerId === 'string' ? payload.playerId : undefined,
        accountStatus: typeof payload?.status === 'string' ? payload.status : undefined,
        accountPersistenceMode: payload?.persistenceStatus?.mode === 'durable' || payload?.persistenceStatus?.mode === 'temporary'
            ? payload.persistenceStatus.mode
            : undefined,
        actionType: typeof payloadActionType === 'string' ? payloadActionType : undefined,
        mode: payload?.mode === 'npc' || payload?.mode === 'online' ? payload.mode : undefined,
        geishaSet: typeof payload?.geishaSet === 'string' ? payload.geishaSet : undefined,
        setupMode: payload?.setupMode === 'random' || payload?.setupMode === 'custom' ? payload.setupMode : undefined,
        hasPayload: Boolean(payload)
    });
};

export const summarizeGameState = (state) => {
    if (!state || typeof state !== 'object') {
        return null;
    }

    return sanitizeContext({
        gameId: typeof state.gameId === 'string' ? state.gameId : undefined,
        geishaSet: typeof state.geishaSet === 'string' ? state.geishaSet : undefined,
        setupMode: state.setupMode === 'random' || state.setupMode === 'custom' ? state.setupMode : undefined,
        phase: typeof state.phase === 'string' ? state.phase : undefined,
        round: typeof state.round === 'number' ? state.round : undefined,
        playerCount: Array.isArray(state.players) ? state.players.length : undefined,
        accountPersistenceMode: state.accountPersistenceStatus?.mode === 'durable' || state.accountPersistenceStatus?.mode === 'temporary'
            ? state.accountPersistenceStatus.mode
            : undefined,
        hasPendingInteraction: Boolean(state.pendingInteraction)
    });
};
