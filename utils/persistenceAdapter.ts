import { createClient } from 'redis';
import type { AccountPersistenceStatus } from '@newhandarky/hanakoji-game-types';
import { backendLogger } from './runtimeLogger.js';

export interface KeyValueClient {
    isOpen?: boolean;
    connect?: () => Promise<unknown>;
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<unknown>;
    on?: (event: 'error', listener: (error: unknown) => void) => unknown;
}

interface JsonPersistenceAdapterOptions {
    redisUrl?: string;
    redisClient?: KeyValueClient | null;
    logLabel: string;
    durableMessage: string;
    temporaryMessage: string;
    unavailableMessage: string;
}

export interface JsonPersistenceAdapter {
    getPersistenceStatus: () => AccountPersistenceStatus;
    checkConnection: () => Promise<AccountPersistenceStatus>;
    getJson: <T>(key: string) => Promise<T | null>;
    setJson: <T>(key: string, value: T) => Promise<void>;
    getStorageFailure: () => unknown;
}

export const createJsonPersistenceAdapter = ({
    redisUrl,
    redisClient = null,
    logLabel,
    durableMessage,
    temporaryMessage,
    unavailableMessage
}: JsonPersistenceAdapterOptions): JsonPersistenceAdapter => {
    const memoryRecords = new Map<string, string>();
    let client = redisClient;
    let storageFailure: unknown = null;

    const getPersistenceStatus = (): AccountPersistenceStatus => {
        if (storageFailure) {
            return {
                mode: 'temporary',
                available: false,
                message: unavailableMessage
            };
        }

        if (client?.isOpen === true) {
            return {
                mode: 'durable',
                available: true,
                message: durableMessage
            };
        }

        if (redisUrl || client) {
            return {
                mode: 'temporary',
                available: false,
                message: unavailableMessage
            };
        }

        return {
            mode: 'temporary',
            available: true,
            message: temporaryMessage
        };
    };

    const getClient = async (): Promise<KeyValueClient | null> => {
        if (client) {
            if (client.isOpen === false && typeof client.connect === 'function') {
                try {
                    await client.connect();
                } catch (error) {
                    storageFailure = error;
                    throw error;
                }
            }
            return client;
        }

        if (!redisUrl) {
            return null;
        }

        const nextClient = createClient({ url: redisUrl }) as unknown as KeyValueClient;
        nextClient.on?.('error', (error) => {
            backendLogger.error(`❌ ${logLabel} Redis 連線錯誤`, {
                error: error instanceof Error ? error.message : 'unknown'
            });
        });

        if (!nextClient.isOpen) {
            try {
                await nextClient.connect?.();
                backendLogger.info(`✅ ${logLabel} Redis 連線成功`);
            } catch (error) {
                storageFailure = error;
                client = null;
                throw error;
            }
        }

        client = nextClient;
        return client;
    };

    const checkConnection = async (): Promise<AccountPersistenceStatus> => {
        if ((redisUrl || client) && client?.isOpen !== true && !storageFailure) {
            try {
                await getClient();
            } catch (_error) {
                // getClient records storage failures; callers only need public status.
            }
        }

        return getPersistenceStatus();
    };

    const getJson = async <T>(key: string): Promise<T | null> => {
        const activeClient = await getClient();
        if (activeClient) {
            try {
                const raw = await activeClient.get(key);
                return raw ? JSON.parse(raw) as T : null;
            } catch (error) {
                storageFailure = error;
                throw error;
            }
        }

        const raw = memoryRecords.get(key);
        return raw ? JSON.parse(raw) as T : null;
    };

    const setJson = async <T>(key: string, value: T): Promise<void> => {
        const serialized = JSON.stringify(value);
        const activeClient = await getClient();
        if (activeClient) {
            try {
                await activeClient.set(key, serialized);
            } catch (error) {
                storageFailure = error;
                throw error;
            }
            return;
        }

        memoryRecords.set(key, serialized);
    };

    return {
        getPersistenceStatus,
        checkConnection,
        getJson,
        setJson,
        getStorageFailure: () => storageFailure
    };
};
