/**
 * Login rate limit: 10 attempts per 15 min per IP; a correct password inside
 * the window still works (successful requests are not counted).
 */
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'correct-horse-battery-staple';
process.env.JWT_SECRET = 'test-only-secret';
process.env.LOGIN_ATTEMPTS_PER_15_MIN = '3';

const express = require('express');
const request = require('supertest');
const authRoutes = require('./authRoutes');

const app = express();
app.set('trust proxy', 1); // like server.js on Cloud Run: X-Forwarded-For is the client
app.use(express.json());
app.use(authRoutes);

describe('POST /auth/login rate limit', () => {
    test('blocks the 4th wrong attempt from one IP with 429 and keeps blocking', async () => {
        const bad = { email: 'admin@test.local', password: 'nope' };
        const codes = [];
        for (let i = 0; i < 5; i++) codes.push((await request(app).post('/auth/login').send(bad)).status);
        expect(codes).toEqual([401, 401, 401, 429, 429]);
    });

    test('a correct login from a fresh IP succeeds and is not counted', async () => {
        const ok = { email: 'admin@test.local', password: 'correct-horse-battery-staple' };
        for (let i = 0; i < 4; i++) {
            const r = await request(app).post('/auth/login').set('X-Forwarded-For', '203.0.113.9').send(ok);
            expect(r.status).toBe(200);
            expect(r.body.token).toBeTruthy();
        }
    });
});
