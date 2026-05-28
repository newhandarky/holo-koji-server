import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

type TestPayload = Record<string, unknown>;
type TestMessage = {
    type: string;
    payload: TestPayload;
};

const parseTestMessage = (raw: WebSocket.RawData): TestMessage => JSON.parse(raw.toString()) as TestMessage;

const getFreePort = async (): Promise<number> => new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port = typeof address === 'object' && address ? address.port : null;
        probe.close(() => {
            if (!port) {
                reject(new Error('Unable to allocate test port'));
                return;
            }
            resolve(port);
        });
    });
});

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const startServer = async (t: TestContext): Promise<{ port: number; child: ReturnType<typeof spawn> }> => {
    const port = await getFreePort();
    const child = spawn(process.execPath, ['index.js'], {
        cwd: serverRoot,
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            REDIS_URL: ''
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
        output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
        output += chunk.toString();
    });

    t.after(() => {
        child.kill('SIGTERM');
    });

    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
        if (child.exitCode !== null) {
            throw new Error(`Server exited before test start: ${output}`);
        }
        try {
            const response = await fetch(`http://127.0.0.1:${port}/health`);
            if (response.ok) {
                return { port, child };
            }
        } catch (_error) {
            await delay(50);
        }
    }

    throw new Error(`Server did not become ready: ${output}`);
};

const connectClient = async (port: number): Promise<WebSocket> => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
});

const sendMessage = (ws: WebSocket, type: string, payload: TestPayload = {}) => {
    ws.send(JSON.stringify({ type, payload }));
};

const waitForMessage = async (
    ws: WebSocket,
    type: string,
    predicate: (payload: TestPayload) => boolean = () => true
): Promise<TestPayload> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        ws.off('message', onMessage);
        reject(new Error(`Timed out waiting for ${type}`));
    }, 3000);

    const onMessage = (raw: WebSocket.RawData) => {
        const message = parseTestMessage(raw);
        if (message.type === type && predicate(message.payload)) {
            clearTimeout(timeout);
            ws.off('message', onMessage);
            resolve(message.payload);
        }
    };

    ws.on('message', onMessage);
});

const waitForAnyMessage = async (ws: WebSocket, types: string[]): Promise<TestMessage> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
        ws.off('message', onMessage);
        reject(new Error(`Timed out waiting for ${types.join(' or ')}`));
    }, 5000);

    const onMessage = (raw: WebSocket.RawData) => {
        const message = parseTestMessage(raw);
        if (types.includes(message.type)) {
            clearTimeout(timeout);
            ws.off('message', onMessage);
            resolve(message);
        }
    };

    ws.on('message', onMessage);
});

test('rejects same-player joins without matching room session token', async (t) => {
    const { port } = await startServer(t);
    const host = await connectClient(port);
    const intruder = await connectClient(port);

    t.after(() => {
        host.close();
        intruder.close();
    });

    sendMessage(host, 'CREATE_ROOM', {
        playerId: 'host',
        displayName: 'Host'
    });

    const created = await waitForMessage(host, 'ROOM_CREATED');
    const createdRoom = created as { roomId: string; roomSessionToken: string };
    assert.equal(typeof createdRoom.roomSessionToken, 'string');
    assert.ok(createdRoom.roomSessionToken.length >= 16);

    sendMessage(intruder, 'JOIN_ROOM', {
        roomId: createdRoom.roomId,
        playerId: 'host',
        displayName: 'Impostor'
    });

    const error = await waitForMessage(intruder, 'ERROR');
    assert.equal(error.code, 'PLAYER_ID_TAKEN');
});

test('reattaches an active player with a matching room session token after disconnect', async (t) => {
    const { port } = await startServer(t);
    const host = await connectClient(port);
    const joiner = await connectClient(port);

    t.after(() => {
        host.close();
        joiner.close();
    });

    sendMessage(host, 'CREATE_ROOM', {
        playerId: 'host',
        displayName: 'Host'
    });
    const created = await waitForMessage(host, 'ROOM_CREATED');
    const createdRoom = created as { roomId: string; roomSessionToken: string };

    sendMessage(joiner, 'JOIN_ROOM', {
        roomId: createdRoom.roomId,
        playerId: 'guest',
        displayName: 'Guest'
    });
    await waitForMessage(joiner, 'PLAYER_JOINED');
    await waitForMessage(joiner, 'GAME_STATE_UPDATED', (state) => state.phase === 'deciding_order');

    host.close();
    await delay(100);

    const reconnectedHost = await connectClient(port);
    t.after(() => {
        reconnectedHost.close();
    });

    sendMessage(reconnectedHost, 'JOIN_ROOM', {
        roomId: createdRoom.roomId,
        playerId: 'host',
        displayName: 'Host',
        roomSessionToken: createdRoom.roomSessionToken
    });

    const message = await waitForAnyMessage(reconnectedHost, ['GAME_STATE_UPDATED', 'ERROR']);
    assert.equal(message.type, 'GAME_STATE_UPDATED');
    const players = message.payload.players as Array<{ id: string }>;
    assert.equal(players.some((player) => player.id === 'host'), true);
    assert.notEqual(message.payload.phase, 'waiting');
});
