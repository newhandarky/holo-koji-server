// @ts-nocheck
import { existsSync, readFileSync } from 'fs';

const LOCAL_ENV_FILE = new URL('../.env.local', import.meta.url);

const parseEnvLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
        return null;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
        return null;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    return { key, value };
};

export const loadLocalEnv = () => {
    if (!existsSync(LOCAL_ENV_FILE)) {
        return;
    }

    const content = readFileSync(LOCAL_ENV_FILE, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const entry = parseEnvLine(line);
        if (!entry || process.env[entry.key]) {
            return;
        }

        process.env[entry.key] = entry.value;
    });
};

loadLocalEnv();
