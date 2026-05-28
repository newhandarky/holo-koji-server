// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerifiedLineAccountRequest } from './lineIdentity.js';

const originalFetch = globalThis.fetch;
const originalLineChannelId = process.env.LINE_CHANNEL_ID;
const originalLineChannelSecret = process.env.LINE_CHANNEL_SECRET;

const restoreEnv = () => {
    globalThis.fetch = originalFetch;
    if (originalLineChannelId === undefined) {
        delete process.env.LINE_CHANNEL_ID;
    } else {
        process.env.LINE_CHANNEL_ID = originalLineChannelId;
    }
    if (originalLineChannelSecret === undefined) {
        delete process.env.LINE_CHANNEL_SECRET;
    } else {
        process.env.LINE_CHANNEL_SECRET = originalLineChannelSecret;
    }
};

test('resolveVerifiedLineAccountRequest verifies LINE id token and builds trusted account request', async () => {
    process.env.LINE_CHANNEL_ID = '1234567890';
    globalThis.fetch = async (url, options) => {
        assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
        assert.equal(options.method, 'POST');
        assert.equal(options.body.get('id_token'), 'id-token');
        assert.equal(options.body.get('client_id'), '1234567890');
        return {
            ok: true,
            json: async () => ({
                sub: 'U1234567890',
                aud: '1234567890',
                name: '銀座玩家',
                picture: 'https://example.test/avatar.png'
            })
        };
    };

    const result = await resolveVerifiedLineAccountRequest({ idToken: 'id-token' });

    assert.equal(result.verifiedIdentity.provider, 'line');
    assert.equal(result.verifiedIdentity.lineUserId, 'U1234567890');
    assert.equal(result.verifiedIdentity.source, 'line-id-token');
    assert.equal(result.profile.displayName, '銀座玩家');
    assert.equal(result.profile.avatarUrl, 'https://example.test/avatar.png');
    restoreEnv();
});

test('resolveVerifiedLineAccountRequest exchanges authorization code before verifying id token', async () => {
    process.env.LINE_CHANNEL_ID = '1234567890';
    process.env.LINE_CHANNEL_SECRET = 'secret';
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, body: options.body });
        if (url === 'https://api.line.me/oauth2/v2.1/token') {
            assert.equal(options.body.get('grant_type'), 'authorization_code');
            assert.equal(options.body.get('code'), 'auth-code');
            assert.equal(options.body.get('redirect_uri'), 'https://example.test/?lineCallback=1');
            assert.equal(options.body.get('client_secret'), 'secret');
            return {
                ok: true,
                json: async () => ({ id_token: 'exchanged-id-token' })
            };
        }

        assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
        assert.equal(options.body.get('id_token'), 'exchanged-id-token');
        return {
            ok: true,
            json: async () => ({
                sub: 'U222',
                aud: '1234567890',
                name: 'Callback Player'
            })
        };
    };

    const result = await resolveVerifiedLineAccountRequest({
        authorizationCode: 'auth-code',
        redirectUri: 'https://example.test/?lineCallback=1'
    });

    assert.equal(calls.length, 2);
    assert.equal(result.verifiedIdentity.lineUserId, 'U222');
    assert.equal(result.verifiedIdentity.source, 'line-authorization-code');
    assert.equal(result.profile.displayName, 'Callback Player');
    restoreEnv();
});

test('resolveVerifiedLineAccountRequest rejects invalid LINE verification responses', async () => {
    process.env.LINE_CHANNEL_ID = '1234567890';
    globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
            sub: 'U1234567890',
            aud: 'wrong-channel',
            name: '銀座玩家'
        })
    });

    const result = await resolveVerifiedLineAccountRequest({ idToken: 'id-token' });

    assert.equal(result, null);
    restoreEnv();
});
