/**
 * Absence notices: admin-only, review list, one email per person per day, never for someone
 * who is not a candidate, and never without a usable email.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';

jest.mock('../../supabase', () => {
    const data = {
        employees: [
            { id: 'u1', employee_id: 'EL001', name: 'Asha', department: 'Workshop', company: 'Englabs India Pvt Ltd', status: 'Active', email: 'asha@real.com', notify_email: true },
            { id: 'u2', employee_id: 'EL002', name: 'Bilal', department: 'Workshop', company: 'Englabs India Pvt Ltd', status: 'Active', email: null, notify_email: false },
            { id: 'u3', employee_id: 'EL003', name: 'Chetan', department: 'Workshop', company: 'Englabs India Pvt Ltd', status: 'Active', email: 'chetan@real.com', notify_email: true },
            { id: 'u4', employee_id: 'EL004', name: 'Sky', department: 'Kitchen', company: 'Sky5 Hotel', status: 'Active', email: 'sky@real.com', notify_email: true },
        ],
        attendance: [{ employee_id: 'u3', check_in: '2026-09-18T03:30:00Z', status: 'ON_TIME' }],
        leaves: [],
        holidays: [],
        audit_log: [],
    };
    const builder = (table) => {
        const api = { select: () => api, eq: () => api, not: () => api, in: () => api, insert: (row) => { data.audit_log.push({ entity_id: row.entity_id, action: row.action }); return Promise.resolve({ error: null }); },
            then: (res, rej) => Promise.resolve({ data: data[table], error: null }).then(res, rej) };
        return api;
    };
    return { from: builder, __data: data };
});
jest.mock('../lib/mailer', () => ({
    config: () => ({ configured: true, to: [] }),
    sendMail: jest.fn(async () => ({ messageId: 'x', recipients: 1 })),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mailer = require('../lib/mailer');
const supabase = require('../../supabase');
const routes = require('./absenceRoutes');

const app = express();
app.use(express.json());
app.use(routes);
const admin = 'Bearer ' + jwt.sign({ email: 'admin@test.local', role: 'admin' }, 'test-only-secret');
const day = '2026-09-18';

describe('absence notices', () => {
    beforeEach(() => { mailer.sendMail.mockClear(); supabase.__data.audit_log.length = 0; });

    test('requires an admin', async () => {
        expect((await request(app).get(`/api/absence-notices?date=${day}`)).status).toBe(401);
        expect((await request(app).post('/api/absence-notices/send').send({ employee_id: 'EL001', date: day })).status).toBe(401);
    });

    test('lists Englabs candidates only (not present staff, not other companies)', async () => {
        const r = await request(app).get(`/api/absence-notices?date=${day}`).set('Authorization', admin);
        expect(r.status).toBe(200);
        expect(r.body.notices.map(n => n.employee_id)).toEqual(['EL001', 'EL002']);
        expect(r.body.notices[0]).toMatchObject({ emailable: true, alreadySent: false });
        expect(r.body.fineInr).toBe(500);
    });

    test('sending emails that person once, records it, and blocks a second notice for the same day', async () => {
        const ok = await request(app).post('/api/absence-notices/send').set('Authorization', admin).send({ employee_id: 'EL001', date: day });
        expect(ok.status).toBe(200);
        expect(mailer.sendMail).toHaveBeenCalledTimes(1);
        expect(mailer.sendMail.mock.calls[0][0]).toMatchObject({ to: 'asha@real.com' });
        expect(mailer.sendMail.mock.calls[0][0].text).toContain('Rs. 500');
        expect(supabase.__data.audit_log).toEqual([{ entity_id: `EL001:${day}`, action: 'absence.notice' }]);
    });

    test('a duplicate is refused (409)', async () => {
        supabase.__data.audit_log.push({ entity_id: `EL001:${day}`, action: 'absence.notice' });
        const r = await request(app).post('/api/absence-notices/send').set('Authorization', admin).send({ employee_id: 'EL001', date: day });
        expect(r.status).toBe(409);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('someone who is not a candidate (checked in / other company) cannot be noticed', async () => {
        for (const id of ['EL003', 'EL004']) {
            const r = await request(app).post('/api/absence-notices/send').set('Authorization', admin).send({ employee_id: id, date: day });
            expect(r.status).toBe(409);
        }
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('no usable email means 422 and nothing is sent', async () => {
        const r = await request(app).post('/api/absence-notices/send').set('Authorization', admin).send({ employee_id: 'EL002', date: day });
        expect(r.status).toBe(422);
        expect(mailer.sendMail).not.toHaveBeenCalled();
    });

    test('bad input is a 400', async () => {
        expect((await request(app).post('/api/absence-notices/send').set('Authorization', admin).send({ employee_id: 'EL001', date: 'x' })).status).toBe(400);
    });
});
