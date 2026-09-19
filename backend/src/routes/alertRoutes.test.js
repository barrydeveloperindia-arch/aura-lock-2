/**
 * Daily alert route: cron-key or admin auth, dry-run preview, Sunday skip, and a real send
 * (mocked mailer) that reports counts.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';
process.env.ALERT_CRON_KEY = 'cron-secret-123';

jest.mock('../../supabase', () => {
    const data = {
        employees: [
            { id: 'u1', employee_id: 'EL001', name: 'Asha', department: 'Workshop', company: 'Englabs India Pvt Ltd', email: 'asha@real.com', notify_email: true },
            { id: 'u2', employee_id: 'EL002', name: 'Bilal', department: 'Workshop', company: 'Englabs India Pvt Ltd' },
        ],
        attendance: [{ employee_id: 'u1', check_in: '2026-09-18T04:30:00Z', status: 'LATE' }],
        leaves: [],
        holidays: [],
    };
    const builder = (table) => {
        const api = { select: () => api, eq: () => api, not: () => api, then: (res, rej) => Promise.resolve({ data: data[table], error: null }).then(res, rej) };
        return api;
    };
    return { from: builder };
});
jest.mock('../lib/mailer', () => ({
    config: () => ({ configured: true, to: ['boss@example.com'] }),
    sendMail: jest.fn(async () => ({ messageId: 'x', recipients: 1 })),
}));

const express = require('express');
const request = require('supertest');
const mailer = require('../lib/mailer');
const alertRoutes = require('./alertRoutes');

const app = express();
app.use(express.json());
app.use(alertRoutes);

describe('POST /api/alerts/daily', () => {
    beforeEach(() => mailer.sendMail.mockClear());

    test('rejects callers with no admin token and no cron key', async () => {
        const r = await request(app).post('/api/alerts/daily?date=2026-09-18');
        expect(r.status).toBe(401);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('rejects a wrong cron key', async () => {
        const r = await request(app).post('/api/alerts/daily?date=2026-09-18').set('x-alert-key', 'nope');
        expect([401, 403]).toContain(r.status);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('dry run with the cron key returns counts and preview but sends nothing', async () => {
        const r = await request(app).post('/api/alerts/daily?date=2026-09-18&dry=1').set('x-alert-key', 'cron-secret-123');
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ sent: false, dry: true, counts: { present: 1, late: 1, notIn: 1, staff: 2 } });
        expect(r.body.text).toContain('Bilal');
        expect(r.body.personal).toEqual([{ employee_id: 'EL001', name: 'Asha', email: 'asha@real.com', time: '10:00' }]);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('a real run emails once and reports the recipients', async () => {
        const r = await request(app).post('/api/alerts/daily?date=2026-09-18').set('x-alert-key', 'cron-secret-123');
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({ sent: true, recipients: 1, personal: { sent: 1, failed: [] } });
        expect(mailer.sendMail).toHaveBeenCalledTimes(2);
        expect(mailer.sendMail.mock.calls[0][0].subject).toMatch(/1 present.*1 late.*1 not in yet/);
        expect(mailer.sendMail.mock.calls[1][0]).toMatchObject({ to: 'asha@real.com' });
        expect(mailer.sendMail.mock.calls[1][0].subject).toMatch(/late today/);
    });

    test('Sunday is skipped without sending', async () => {
        const r = await request(app).post('/api/alerts/daily?date=2026-09-20').set('x-alert-key', 'cron-secret-123');
        expect(r.body).toMatchObject({ sent: false, skipped: 'Sunday' });
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('a malformed date is a 400', async () => {
        const r = await request(app).post('/api/alerts/daily?date=tomorrow').set('x-alert-key', 'cron-secret-123');
        expect(r.status).toBe(400);
    });
});
