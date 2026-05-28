import express, { type Express } from 'express';
import cors from 'cors';

const CORS_ORIGINS = [
    'http://localhost:3000',
    'https://holo-koji-frontend.onrender.com',
    'https://newhandarky.github.io',
    'https://newhandarky.github.io/holo-koji',
    'https://newhandarky.github.io/holo-koji/'
];

export const createHttpApp = (): Express => {
    const app = express();

    app.use(cors({
        origin: CORS_ORIGINS,
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }));

    app.use(express.json());

    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            environment: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            corsOrigins: CORS_ORIGINS
        });
    });

    return app;
};
