import { GameState, LineAccountProfile } from 'game-shared-types';

export interface RoomSocketLike {
    readyState: number;
    send: (payload: string) => void;
    close?: (code?: number, reason?: string) => void;
}

export interface RoomSeat {
    playerId: string;
    ws: RoomSocketLike;
    isNpc?: boolean;
    name?: string;
    lineUserId?: string;
    avatarUrl?: string;
    accountProfile?: LineAccountProfile;
    sessionToken?: string;
}

export interface SerializedRoomSeat {
    playerId?: string;
    name?: string;
    lineUserId?: string;
    avatarUrl?: string;
    accountProfile?: LineAccountProfile;
    sessionToken?: string;
    isNpc?: boolean;
}

export interface RoomSnapshotLike {
    players?: SerializedRoomSeat[];
    gameState?: Omit<Partial<GameState>, 'players'> & {
        players?: Array<Partial<GameState['players'][number]>>;
    };
}

export const createDisconnectedSocket = (): RoomSocketLike => ({
    readyState: 3,
    send: () => { }
});

export const createNpcSocket = (): RoomSocketLike => ({
    readyState: 1,
    send: () => { }
});

const sanitizeString = (value: unknown): string | undefined => (
    typeof value === 'string' && value.trim() ? value.trim() : undefined
);

export const serializeRoomSeat = (player: Partial<RoomSeat> = {}): SerializedRoomSeat => ({
    playerId: player.playerId,
    name: player.name ?? player.playerId,
    lineUserId: player.lineUserId,
    avatarUrl: player.avatarUrl,
    accountProfile: player.accountProfile,
    sessionToken: player.sessionToken,
    isNpc: Boolean(player.isNpc)
});

export const buildRestoredRoomSeats = (snapshot: RoomSnapshotLike = {}): RoomSeat[] => {
    const seatsById = new Map<string, RoomSeat>();
    const savedSeats = Array.isArray(snapshot.players) ? snapshot.players : [];

    savedSeats.forEach((seat) => {
        const playerId = sanitizeString(seat?.playerId);
        if (!playerId) {
            return;
        }

        const isNpc = Boolean(seat.isNpc);
        seatsById.set(playerId, {
            playerId,
            ws: isNpc ? createNpcSocket() : createDisconnectedSocket(),
            isNpc,
            name: sanitizeString(seat.name) ?? playerId,
            lineUserId: sanitizeString(seat.lineUserId),
            avatarUrl: sanitizeString(seat.avatarUrl),
            accountProfile: seat.accountProfile,
            sessionToken: sanitizeString(seat.sessionToken)
        });
    });

    const statePlayers = Array.isArray(snapshot.gameState?.players)
        ? snapshot.gameState.players
        : [];

    statePlayers.forEach((player) => {
        const playerId = sanitizeString(player?.id);
        if (!playerId || seatsById.has(playerId)) {
            return;
        }

        seatsById.set(playerId, {
            playerId,
            ws: createDisconnectedSocket(),
            isNpc: false,
            name: sanitizeString(player.name) ?? playerId,
            lineUserId: sanitizeString(player.lineUserId),
            avatarUrl: sanitizeString(player.avatarUrl),
            accountProfile: undefined,
            sessionToken: undefined
        });
    });

    return Array.from(seatsById.values());
};
