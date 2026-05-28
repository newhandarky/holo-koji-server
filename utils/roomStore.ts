// server/utils/roomStore.js - Redis 房間持久化
import { createClient, RedisClientType } from 'redis';
import { backendLogger } from './runtimeLogger.js';

const REDIS_URL = process.env.REDIS_URL;
const ROOM_TTL_SECONDS = Number.parseInt(process.env.ROOM_TTL_SECONDS ?? '3600', 10);
const ROOM_KEY_PREFIX = 'hanamikoji:room:';

let redisClient: RedisClientType | null = null;

const getRoomKey = (roomId: string) => `${ROOM_KEY_PREFIX}${roomId}`;

export const isRedisEnabled = () => Boolean(REDIS_URL);

const getClient = async (): Promise<RedisClientType | null> => {
    if (!REDIS_URL) {
        return null;
    }

    if (!redisClient) {
        redisClient = createClient({ url: REDIS_URL });
        redisClient.on('error', (error) => {
            backendLogger.error('❌ Redis 連線錯誤', {
                error: error instanceof Error ? error.message : 'unknown'
            });
        });
    }

    if (!redisClient.isOpen) {
        await redisClient.connect();
        backendLogger.info('✅ Redis 連線成功');
    }

    return redisClient;
};

export const saveRoomSnapshot = async (roomId: string, snapshot: unknown): Promise<void> => {
    if (!REDIS_URL) {
        return;
    }

    try {
        const client = await getClient();
        if (!client) {
            return;
        }
        const payload = JSON.stringify(snapshot);
        await client.set(getRoomKey(roomId), payload, { EX: ROOM_TTL_SECONDS });
    } catch (error) {
        backendLogger.error(`❌ 儲存房間 ${roomId} 失敗`, {
            roomId,
            error: error instanceof Error ? error.message : 'unknown'
        });
    }
};

export const loadRoomSnapshot = async <TSnapshot = unknown>(roomId: string): Promise<TSnapshot | null> => {
    if (!REDIS_URL) {
        return null;
    }

    try {
        const client = await getClient();
        if (!client) {
            return null;
        }
        const raw = await client.get(getRoomKey(roomId));
        return raw ? JSON.parse(raw) as TSnapshot : null;
    } catch (error) {
        backendLogger.error(`❌ 讀取房間 ${roomId} 失敗`, {
            roomId,
            error: error instanceof Error ? error.message : 'unknown'
        });
        return null;
    }
};

export const deleteRoomSnapshot = async (roomId: string): Promise<void> => {
    if (!REDIS_URL) {
        return;
    }

    try {
        const client = await getClient();
        if (!client) {
            return;
        }
        await client.del(getRoomKey(roomId));
    } catch (error) {
        backendLogger.error(`❌ 刪除房間 ${roomId} 失敗`, {
            roomId,
            error: error instanceof Error ? error.message : 'unknown'
        });
    }
};
