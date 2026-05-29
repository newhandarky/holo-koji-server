import type { LineAccountProfile } from '@newhandarky/hanakoji-game-types';

export interface WebSocketConnectionContext {
    origin: string;
    currentPlayerId: string | null;
    currentRoomId: string | null;
    currentAccountProfile: LineAccountProfile | null;
}

export const createConnectionContext = (originHeader: unknown): WebSocketConnectionContext => ({
    origin: typeof originHeader === 'string' ? originHeader : 'unknown',
    currentPlayerId: null,
    currentRoomId: null,
    currentAccountProfile: null
});
