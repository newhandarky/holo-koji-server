// server/utils/roomStore.js - Redis 房間持久化
import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL;
const ROOM_TTL_SECONDS = Number.parseInt(process.env.ROOM_TTL_SECONDS ?? '3600', 10);
const ROOM_KEY_PREFIX = 'hanamikoji:room:';

let redisClient = null;

const getRoomKey = (roomId) => `${ROOM_KEY_PREFIX}${roomId}`;

export const isRedisEnabled = () => Boolean(REDIS_URL);

const getClient = async () => {
    if (!REDIS_URL) {
        return null;
    }

    if (!redisClient) {
        redisClient = createClient({ url: REDIS_URL });
        redisClient.on('error', (error) => {
            console.error('❌ Redis 連線錯誤:', error);
        });
    }

    if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('✅ Redis 連線成功');
    }

    return redisClient;
};

export const saveRoomSnapshot = async (roomId, snapshot) => {
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
        console.error(`❌ 儲存房間 ${roomId} 失敗:`, error);
    }
};

export const loadRoomSnapshot = async (roomId) => {
    if (!REDIS_URL) {
        return null;
    }

    try {
        const client = await getClient();
        if (!client) {
            return null;
        }
        const raw = await client.get(getRoomKey(roomId));
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error(`❌ 讀取房間 ${roomId} 失敗:`, error);
        return null;
    }
};

export const deleteRoomSnapshot = async (roomId) => {
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
        console.error(`❌ 刪除房間 ${roomId} 失敗:`, error);
    }
};
