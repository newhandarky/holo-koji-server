import { randomBytes } from 'node:crypto';
import type { LineAccountProfile } from '@newhandarky/hanakoji-game-types';
import type { PlayerMetaMap } from '../game/serverGameStateTypes.js';
import {
    createDisconnectedSocket,
    type RoomSeat,
    type RoomSocketLike
} from '../utils/roomSession.js';

export type PlayerMetaPayload = {
    displayName?: unknown;
    lineUserId?: unknown;
    avatarUrl?: unknown;
    accountProfile?: LineAccountProfile | null;
    roomSessionToken?: unknown;
};

export type AddPlayerResult = 'invalid' | 'existing' | 'full' | 'session-mismatch' | 'added';

type AddRoomPlayerResult = {
    result: AddPlayerResult;
    seats: RoomSeat[];
};

type DetachRoomPlayerResult = {
    detached: boolean;
    seats: RoomSeat[];
};

type SessionTokenSource = () => string;

const createRoomSessionToken = (): string => randomBytes(24).toString('hex');

const normalizeRoomSessionToken = (token: unknown): string | null => (
    typeof token === 'string' && token.trim() ? token.trim() : null
);

const normalizePlayerMeta = (playerId: string, payload: PlayerMetaPayload = {}) => {
    const displayName = typeof payload.displayName === 'string' && payload.displayName.trim()
        ? payload.displayName.trim()
        : playerId;

    const accountProfile = payload.accountProfile && typeof payload.accountProfile === 'object'
        ? payload.accountProfile as LineAccountProfile
        : null;

    const lineUserId = typeof accountProfile?.lineUserId === 'string' && accountProfile.lineUserId.trim()
        ? accountProfile.lineUserId.trim()
        : undefined;

    const avatarUrl = typeof accountProfile?.avatarUrl === 'string' && accountProfile.avatarUrl.trim()
        ? accountProfile.avatarUrl.trim()
        : undefined;

    return {
        name: displayName,
        lineUserId,
        avatarUrl,
        accountProfile: accountProfile ?? undefined
    };
};

export const addRoomPlayer = (
    seats: readonly RoomSeat[],
    maxPlayers: number,
    playerId: string,
    ws: RoomSocketLike,
    meta: PlayerMetaPayload = {},
    tokenSource: SessionTokenSource = createRoomSessionToken
): AddRoomPlayerResult => {
    if (!playerId) {
        return { result: 'invalid', seats: [...seats] };
    }

    const normalizedMeta = normalizePlayerMeta(playerId, meta);
    const requestedSessionToken = normalizeRoomSessionToken(meta.roomSessionToken);
    const existingPlayer = seats.find(player => player.playerId === playerId);

    if (existingPlayer) {
        if (
            existingPlayer.isNpc
            || !existingPlayer.sessionToken
            || requestedSessionToken !== existingPlayer.sessionToken
        ) {
            return { result: 'session-mismatch', seats: [...seats] };
        }

        return {
            result: 'existing',
            seats: seats.map(player => player.playerId === playerId
                ? {
                    ...player,
                    ws,
                    name: normalizedMeta.name || player.name,
                    lineUserId: normalizedMeta.lineUserId || player.lineUserId,
                    avatarUrl: normalizedMeta.avatarUrl || player.avatarUrl,
                    accountProfile: normalizedMeta.accountProfile || player.accountProfile
                }
                : player)
        };
    }

    if (seats.length >= maxPlayers) {
        return { result: 'full', seats: [...seats] };
    }

    return {
        result: 'added',
        seats: [
            ...seats,
            {
                playerId,
                ws,
                sessionToken: requestedSessionToken ?? tokenSource(),
                name: normalizedMeta.name,
                lineUserId: normalizedMeta.lineUserId,
                avatarUrl: normalizedMeta.avatarUrl,
                accountProfile: normalizedMeta.accountProfile
            }
        ]
    };
};

export const removeRoomPlayer = (
    seats: readonly RoomSeat[],
    playerId: string,
    ws: RoomSocketLike | null = null
): RoomSeat[] => {
    const player = seats.find(seat => seat.playerId === playerId);
    if (!player || (ws && player.ws !== ws)) {
        return [...seats];
    }

    return seats.filter(seat => seat.playerId !== playerId);
};

export const detachRoomPlayer = (
    seats: readonly RoomSeat[],
    playerId: string,
    ws: RoomSocketLike | null = null
): DetachRoomPlayerResult => {
    const player = seats.find(seat => seat.playerId === playerId);
    if (!player || (ws && player.ws !== ws)) {
        return { detached: false, seats: [...seats] };
    }

    return {
        detached: true,
        seats: seats.map(seat => seat.playerId === playerId
            ? { ...seat, ws: createDisconnectedSocket() }
            : seat)
    };
};

export const buildPlayerMetaMap = (seats: readonly RoomSeat[]): PlayerMetaMap => (
    seats.reduce<PlayerMetaMap>((map, player) => {
        map[player.playerId] = {
            name: player.name ?? player.playerId,
            lineUserId: player.lineUserId,
            avatarUrl: player.avatarUrl
        };
        return map;
    }, {})
);
