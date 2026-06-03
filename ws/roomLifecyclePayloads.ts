import type {
    CreateRoomPayload,
    GeishaSet,
    JoinRoomPayload,
    RoomSetupMode
} from '@newhandarky/hanakoji-game-types';
import { DEFAULT_ROOM_SETUP_MODE } from '../game/geishaSetCatalog.js';
import {
    isSupportedGeishaSet,
    normalizeGeishaSet,
    normalizeRoomSetupMode
} from '../game/geishaSetupRules.js';
import {
    CUSTOM_SELECTION_ERROR_MESSAGE,
    LEGACY_GEISHA_SET_ERROR_MESSAGE
} from '../rooms/roomErrors.js';
import type { PlayerMetaPayload } from '../rooms/roomMembership.js';
import type { NpcDifficulty } from '../npc/npcConfig.js';
import { normalizeNpcDifficulty } from '../npc/npcConfig.js';

type JsonObject = Record<string, unknown>;

export interface LifecyclePayloadError {
    message: string;
    code?: string;
}

export type LifecyclePayloadResult<TValue> =
    | { ok: true; value: TValue }
    | { ok: false; error: LifecyclePayloadError };

export type ParsedCreateRoomPayload = {
    rawPayload: Partial<CreateRoomPayload> & PlayerMetaPayload;
    playerId: string;
    mode: 'online' | 'npc';
    aiDifficulty: NpcDifficulty;
    requestedGeishaSet: GeishaSet | string;
    setupMode: RoomSetupMode;
};

export type ParsedJoinRoomPayload = {
    rawPayload: Partial<JoinRoomPayload> & PlayerMetaPayload;
    roomId: string;
    playerId: string;
};

export const isRecord = (value: unknown): value is JsonObject => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const parseCreateRoomPayload = (payload: unknown): LifecyclePayloadResult<ParsedCreateRoomPayload> => {
    if (!isRecord(payload) || typeof payload.playerId !== 'string' || !payload.playerId) {
        return { ok: false, error: { message: '缺少 playerId' } };
    }

    const rawPayload = payload as Partial<CreateRoomPayload> & PlayerMetaPayload;
    const mode = rawPayload.mode === 'npc' ? 'npc' : 'online';
    const aiDifficulty = normalizeNpcDifficulty(rawPayload.aiDifficulty ?? 'easy');
    const requestedGeishaSet = normalizeGeishaSet(rawPayload.geishaSet);
    if (!isSupportedGeishaSet(requestedGeishaSet)) {
        return { ok: false, error: { message: LEGACY_GEISHA_SET_ERROR_MESSAGE } };
    }

    let setupMode = DEFAULT_ROOM_SETUP_MODE;
    try {
        setupMode = normalizeRoomSetupMode(rawPayload.setupMode);
    } catch (_error) {
        return { ok: false, error: { message: CUSTOM_SELECTION_ERROR_MESSAGE } };
    }

    return {
        ok: true,
        value: {
            rawPayload,
            playerId: payload.playerId,
            mode,
            aiDifficulty,
            requestedGeishaSet,
            setupMode
        }
    };
};

export const parseJoinRoomPayload = (payload: unknown): LifecyclePayloadResult<ParsedJoinRoomPayload> => {
    if (!isRecord(payload) || typeof payload.roomId !== 'string' || typeof payload.playerId !== 'string' || !payload.roomId || !payload.playerId) {
        return {
            ok: false,
            error: { message: '缺少 roomId 或 playerId', code: 'INVALID_JOIN_REQUEST' }
        };
    }

    return {
        ok: true,
        value: {
            rawPayload: payload as Partial<JoinRoomPayload> & PlayerMetaPayload,
            roomId: payload.roomId,
            playerId: payload.playerId
        }
    };
};
