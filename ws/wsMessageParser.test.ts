import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
    getMessagePayload,
    parseWebSocketMessage
} from './wsMessageParser.js';

test('parseWebSocketMessage parses raw websocket data without changing payload shape', () => {
    const message = parseWebSocketMessage(Buffer.from(JSON.stringify({
        type: 'GAME_ACTION',
        payload: {
            action: {
                type: 'secret',
                payload: { cardId: 'card-1' }
            }
        }
    })));

    assert.equal(message.type, 'GAME_ACTION');
    assert.deepEqual(getMessagePayload(message), {
        action: {
            type: 'secret',
            payload: { cardId: 'card-1' }
        }
    });
});

test('parseWebSocketMessage keeps invalid json as a thrown parse error for router catch', () => {
    assert.throws(
        () => parseWebSocketMessage(Buffer.from('{invalid-json')),
        SyntaxError
    );
});

test('getMessagePayload returns undefined when the message has no payload property', () => {
    assert.equal(getMessagePayload({ type: 'ACCOUNT_STATUS' }), undefined);
});
