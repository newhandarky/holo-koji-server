import { backendLogger } from './runtimeLogger.js';

const LINE_VERIFY_ID_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/verify';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';

const sanitizeString = (value) => (
    typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const buildVerifiedIdentity = (verifiedProfile, source) => {
    const lineUserId = sanitizeString(verifiedProfile?.sub);
    if (!lineUserId) {
        return null;
    }

    return {
        verifiedIdentity: {
            provider: 'line',
            lineUserId,
            source,
            verifiedAt: new Date().toISOString()
        },
        profile: {
            displayName: sanitizeString(verifiedProfile?.name) ?? lineUserId,
            avatarUrl: sanitizeString(verifiedProfile?.picture)
        }
    };
};

const verifyIdToken = async (idToken) => {
    const lineChannelId = sanitizeString(process.env.LINE_CHANNEL_ID);
    if (!lineChannelId) {
        throw new Error('LINE_CHANNEL_ID is not configured');
    }

    const body = new URLSearchParams({
        id_token: idToken,
        client_id: lineChannelId
    });

    const response = await fetch(LINE_VERIFY_ID_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        throw new Error(`LINE ID token verification failed: ${response.status}`);
    }

    const verifiedProfile = await response.json();
    if (verifiedProfile?.aud !== lineChannelId) {
        throw new Error('LINE ID token audience mismatch');
    }

    return verifiedProfile;
};

const exchangeAuthorizationCode = async ({ authorizationCode, redirectUri }) => {
    const lineChannelId = sanitizeString(process.env.LINE_CHANNEL_ID);
    const lineChannelSecret = sanitizeString(process.env.LINE_CHANNEL_SECRET);
    if (!lineChannelId || !lineChannelSecret) {
        throw new Error('LINE channel credentials are not configured');
    }

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: redirectUri,
        client_id: lineChannelId,
        client_secret: lineChannelSecret
    });

    const response = await fetch(LINE_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!response.ok) {
        throw new Error(`LINE authorization code exchange failed: ${response.status}`);
    }

    const tokenPayload = await response.json();
    const idToken = sanitizeString(tokenPayload?.id_token);
    if (!idToken) {
        throw new Error('LINE token response did not include id_token');
    }

    return idToken;
};

export const resolveVerifiedLineAccountRequest = async (payload = {}) => {
    try {
        const idToken = sanitizeString(payload.idToken);
        if (idToken) {
            const verifiedProfile = await verifyIdToken(idToken);
            return buildVerifiedIdentity(verifiedProfile, 'line-id-token');
        }

        const authorizationCode = sanitizeString(payload.authorizationCode);
        const redirectUri = sanitizeString(payload.redirectUri);
        if (authorizationCode && redirectUri) {
            const exchangedIdToken = await exchangeAuthorizationCode({ authorizationCode, redirectUri });
            const verifiedProfile = await verifyIdToken(exchangedIdToken);
            return buildVerifiedIdentity(verifiedProfile, 'line-authorization-code');
        }
    } catch (error) {
        backendLogger.warn('⚠️ LINE identity verification failed', {
            error: error instanceof Error ? error.message : 'unknown'
        });
    }

    return null;
};
