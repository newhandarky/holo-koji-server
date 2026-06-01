import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './gameRoom.js';
import {
    restoreRoomFromSnapshot,
    type RestorableRoomSnapshot
} from './roomRestore.js';
import {
    createDisconnectedSocket,
    type RoomSocketLike
} from '../utils/roomSession.js';

type CapturedMessage = {
    type: string;
    payload?: unknown;
};

const createCapturingSocket = (): { ws: RoomSocketLike; messages: CapturedMessage[] } => {
    const messages: CapturedMessage[] = [];
    return {
        ws: {
            readyState: 1,
            send: payload => {
                messages.push(JSON.parse(payload) as CapturedMessage);
            }
        },
        messages
    };
};

test('GameRoom module constructs default room state without starting the server entrypoint', () => {
    const room = new GameRoom('room-default');

    assert.equal(room.roomId, 'room-default');
    assert.equal(room.maxPlayers, 2);
    assert.equal(room.hostId, null);
    assert.equal(room.gameState, null);
    assert.deepEqual(room.players, []);
    assert.equal(room.npcId, null);
});

test('GameRoom snapshot serializes seats without socket objects', () => {
    const room = new GameRoom('room-snapshot');
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];

    const snapshot = room.buildRoomSnapshot();
    const seats = snapshot.players as Array<Record<string, unknown>>;

    assert.equal(seats.length, 1);
    assert.deepEqual(seats[0], {
        playerId: 'host',
        name: 'Host',
        lineUserId: undefined,
        avatarUrl: undefined,
        accountProfile: undefined,
        sessionToken: 'host-token',
        isNpc: false
    });
    assert.equal('ws' in (seats[0] ?? {}), false);
});

test('GameRoom remains compatible with room snapshot restore', () => {
    const room = new GameRoom('room-restore');
    room.hostId = 'host';
    room.players = [{
        playerId: 'host',
        name: 'Host',
        sessionToken: 'host-token',
        ws: createDisconnectedSocket()
    }];
    assert.equal(room.regenerateBaseGeishas(), true);

    const result = restoreRoomFromSnapshot(
        room.buildRoomSnapshot() as RestorableRoomSnapshot,
        { createRoom: roomId => new GameRoom(roomId) }
    );

    assert.equal(result.errorMessage, null);
    assert.equal(result.room?.roomId, 'room-restore');
    assert.equal(result.room?.hostId, 'host');
    assert.equal(result.room?.players[0]?.playerId, 'host');
    assert.equal(result.room?.players[0]?.ws.readyState, 3);
    assert.equal(result.room?.baseGeishas?.length, 7);
});

test('GameRoom starts game before sending masked deal animation cards', () => {
    const host = createCapturingSocket();
    const guest = createCapturingSocket();
    const room = new GameRoom('room-start');
    room.hostId = 'host';
    room.players = [
        { playerId: 'host', name: 'Host', ws: host.ws },
        { playerId: 'guest', name: 'Guest', ws: guest.ws }
    ];
    assert.equal(room.regenerateBaseGeishas(), true);
    assert.equal(room.prepareOrderDecisionState(), true);
    room.orderDecisionState.result = {
        firstPlayer: 'host',
        secondPlayer: 'guest',
        order: ['host', 'guest']
    };
    room.orderDecisionState.confirmations = new Set(['host', 'guest']);
    room.readyConfirmations = new Set(['host', 'guest']);

    room.startGameWithOrder();

    const startedIndex = host.messages.findIndex(message => message.type === 'GAME_STARTED');
    const animationIndex = host.messages.findIndex(message => message.type === 'DEAL_ANIMATION');
    assert.ok(startedIndex >= 0);
    assert.ok(animationIndex > startedIndex);

    const animation = host.messages[animationIndex]?.payload as {
        sequence?: Array<{ card?: { id?: string; type?: string } }>;
    };
    assert.equal(animation.sequence?.length, 12);
    assert.equal(animation.sequence?.every(step => (
        step.card?.type === 'hidden'
        && step.card.id?.startsWith('hidden-host-deal-')
    )), true);
});
