import type {
    GameActionPayload,
    ServerAction
} from '../game/actionValidation.js';

type JsonObject = Record<string, unknown>;

type ParsedGameActionPayload =
    | { ok: true; action: ServerAction }
    | { ok: false };

const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const parseGameActionPayload = (payload: unknown): ParsedGameActionPayload => {
    if (!isRecord(payload) || !isRecord(payload.action) || typeof payload.action.type !== 'string') {
        return { ok: false };
    }

    const actionPayload = isRecord(payload.action.payload)
        ? payload.action.payload as GameActionPayload
        : undefined;

    return {
        ok: true,
        action: {
            type: payload.action.type,
            ...(actionPayload ? { payload: actionPayload } : {})
        }
    };
};
