import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHealthResponse, createHttpApp } from './app.js';

test('health response reports service readiness without room or persistence dependencies', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test-health';

    try {
        const response = buildHealthResponse();

        assert.equal(response.status, 'ok');
        assert.equal(response.environment, 'test-health');
        assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
        assert.ok(response.corsOrigins.includes('https://holo-koji-frontend.onrender.com'));
    } finally {
        if (previousNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = previousNodeEnv;
        }
    }
});

test('http app exposes GET /health for Render deploy checks', () => {
    const app = createHttpApp();
    const stack = (app as unknown as {
        _router?: {
            stack?: Array<{
                route?: {
                    path?: string;
                    methods?: Record<string, boolean>;
                };
            }>;
        };
    })._router?.stack ?? [];

    const healthRoute = stack.find((layer) => layer.route?.path === '/health');

    assert.ok(healthRoute, 'expected /health route to be registered');
    assert.equal(healthRoute.route?.methods?.get, true);
});
