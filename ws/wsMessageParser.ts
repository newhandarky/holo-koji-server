import { type RawData } from 'ws';
import type { ClientToServerMessage } from '@newhandarky/hanakoji-game-types';

export type ParsedWebSocketMessage = Partial<ClientToServerMessage> & {
    type?: unknown;
    payload?: unknown;
};

export const getMessagePayload = (message: ParsedWebSocketMessage): unknown => (
    message.payload
);

export const parseWebSocketMessage = (data: RawData): ParsedWebSocketMessage => (
    JSON.parse(data.toString()) as ParsedWebSocketMessage
);
