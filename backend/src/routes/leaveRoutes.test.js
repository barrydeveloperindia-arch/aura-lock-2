/**
 * POST /api/leaves/range: mark 2+ days off in one call, skipping Sundays and
 * holidays automatically (11 Sep 2026 — the leave form only took one date at
 * a time before this).
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';

jest.mock('../../supabase', () => {
    const state = {
        employees: [{ id: 'emp-uuid-1', employee_id: 'EL107', name: 'Gaurav Panchal', department: 'Civil Engineering', is_deleted: false }],
        leaves: [],
        holidays: [{ date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' }],
    };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    function builder(table) {
        const q = { table, filters: [], order: null, op: 'select', payload: null, single: false, maybe: false };
        const api = {
            select() { return api; },
            insert(rows) { q.op = 'insert'; q.payload = rows; return api; },
            upsert(rows, opts) { q.op = 'upsert'; q.payload = rows; q.conflict = opts?.onConflict; return api; },
            update(row) { q.op = 'update'; q.payload = row; return api; },
            delete() { q.op = 'delete'; return api; },
            eq(col, val) { q.filters.push(r => r[col] === val); return api; },
            ilike(col, val) { q.filters.push(r => String(r[col]).toLowerCase() === String(val).toLowerCase()); return api; },
            gte(col, val) { q.filters.push(r => r[col] >= val); return api; },
            lte(col, val) { q.filters.push(r => r[col] <= val); return api; },
            order(col, { ascending = true } = {}) { q.order = { col, ascending }; return api; },
            single() { q.single = true; return api; },
            maybeSingle() { q.maybe = true; return api; },
            then(resolve, reject) { return run().then(resolve, reject); },
        };
        async function run() {
            const rows = state[table] || (state[table] = []);
            if (q.op === 'upsert') {
                const incoming = Array.isArray(q.payload) ? q.payload : [q.payload];
                const conflictCols = (q.conflict || '').split(',').map(s => s.trim());
                const out = incoming.map(row => {
                    const existing = rows.find(r => conflictCols.every(c => r[c] === row[c]));
                    const saved = existing
                        ? Object.assign(existing, clone(row))
                        : (() => { const n = { id: `00000000-0000-0000-0000-${String(rows.length + 1).padStart(12, '0')}`, created_at: new Date().toISOString(), ...clone(row) }; rows.push(n); return n; })();
                    return clone(saved);
                });
                return { data: q.single ? out[0] : out, error: null };
            }
            if (q.op === 'update') {
                const hits = rows.filter(r => q.filters.every(f => f(r)));
                for (const h of hits) Object.assign(h, clone(q.payload));
                if (q.single || q.maybe) return { data: hits[0] ? clone(hits[0]) : null, error: null };
                return { data: clone(hits), error: null };
            }
            if (q.op === 'delete') {
                const hits = rows.filter(r => q.filters.every(f => f(r)));
                for (const h of hits) rows.splice(rows.indexOf(h), 1);
                return { data: clone(hits), error: null };
            }
            let hits = rows.filter(r => q.filters.every(f => f(r)));
            if (q.order) hits.sort((a, b) => (a[q.order.col] > b[q.order.col] ? 1 : -1) * (q.order.ascending ? 1 : -1));
            if (q.single || q.maybe) return { data: hits[0] ? clone(hits[0]) : null, error: null };
            return { data: clone(hits), error: null };
        }
        return api;
    }
    return { from: builder, __state: state };
});
jest.mock('../middleware/auth', () => ({
    authenticateToken: (req, _res, next) => { req.user = { email: 'admin@test.local', role: 'admin' }; next(); },
    isAdmin: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const supabase = require('../../supabase');
const leaveRoutes = require('./leaveRoutes');
const { leavesBetween } = leaveRoutes;

const app = express();
app.use(express.json());
app.use(leaveRoutes);

beforeEach(() => { supabase.__state.leaves.length = 0; });

describe('POST /api/leaves/range', () => {
    test('marks every working day, skipping the Sunday and the holiday in between', async () => {
        // Wed 30 Sep -> Mon 5 Oct 2026: Sun 4 Oct and holiday Fri 2 Oct are skipped.
        const res = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-30', to: '2026-10-05', type: 'cl', note: 'family function' });
        expect(res.status).toBe(201);
        expect(res.body.created).toBe(4); // 30 Sep, 1 Oct, 3 Oct, 5 Oct
        expect(res.body.leaves.map(l => l.date).sort()).toEqual(['2026-09-30', '2026-10-01', '2026-10-03', '2026-10-05']);
        expect(res.body.leaves.every(l => l.type === 'CL')).toBe(true);
        const skippedDates = res.body.skipped.map(s => s.date).sort();
        expect(skippedDates).toEqual(['2026-10-02', '2026-10-04']);
        expect(res.body.skipped.find(s => s.date === '2026-10-02').reason).toMatch(/holiday/i);
        expect(res.body.skipped.find(s => s.date === '2026-10-04').reason).toBe('Sunday');
    });

    test('a single-day range behaves like one leave', async () => {
        const res = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-15', to: '2026-09-15', type: 'SL' });
        expect(res.status).toBe(201);
        expect(res.body.created).toBe(1);
        expect(res.body.skipped).toEqual([]);
    });

    test('rejects a reversed range and an unknown employee', async () => {
        const bad1 = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-10-05', to: '2026-09-30', type: 'CL' });
        expect(bad1.status).toBe(400);
        const bad2 = await request(app).post('/api/leaves/range').send({ employee_id: 'EL999', from: '2026-09-01', to: '2026-09-02', type: 'CL' });
        expect(bad2.status).toBe(404);
    });

    test('a range that is entirely Sundays/holidays creates nothing', async () => {
        const res = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-10-02', to: '2026-10-02', type: 'CL' }); // the holiday
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/nothing to mark/i);
    });

    test('re-submitting the same range upserts instead of duplicating', async () => {
        await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-21', to: '2026-09-22', type: 'CL' });
        const res = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-21', to: '2026-09-22', type: 'SL' });
        expect(res.status).toBe(201);
        expect(supabase.__state.leaves.filter(l => l.date === '2026-09-21' || l.date === '2026-09-22')).toHaveLength(2);
        expect(res.body.leaves.every(l => l.type === 'SL')).toBe(true);
    });

    test('a new range starts Pending, not Approved', async () => {
        const res = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-17', type: 'CL' });
        expect(res.body.leaves.every(l => l.status === 'Pending')).toBe(true);
    });
});

describe('POST /api/leaves (single day)', () => {
    test('also starts Pending', async () => {
        const res = await request(app).post('/api/leaves').send({ employee_id: 'EL107', date: '2026-09-10', type: 'SL' });
        expect(res.status).toBe(201);
        expect(res.body.leave.status).toBe('Pending');
    });
});

describe('PATCH /api/leaves/:id', () => {
    test('approves a leave day, recording who signed', async () => {
        const created = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        const id = created.body.leaves[0].id;
        const res = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved', approved_by: 'Bharat sir' });
        expect(res.status).toBe(200);
        expect(res.body.leave.status).toBe('Approved');
        expect(res.body.leave.approved_by).toEqual(['Bharat sir']); // a single name still comes back as a one-item array
        expect(supabase.__state.leaves.find(l => l.id === id).status).toBe('Approved');
    });

    test('also accepts Rejected (matches the printed form: Approved / Rejected)', async () => {
        const created = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        const id = created.body.leaves[0].id;
        const res = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Rejected', approved_by: 'Salil sir' });
        expect(res.status).toBe(200);
        expect(res.body.leave.status).toBe('Rejected');
        expect(res.body.leave.approved_by).toEqual(['Salil sir']);
    });

    test('more than one person can sign the same leave', async () => {
        const created = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        const id = created.body.leaves[0].id;
        const res = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved', approved_by: ['Bharat sir', 'Salil sir', 'Bharat sir'] }); // a duplicate is deduped
        expect(res.status).toBe(200);
        expect(res.body.leave.approved_by).toEqual(['Bharat sir', 'Salil sir']);
    });

    test('Approved/Rejected require approved_by to be one of the fixed signers', async () => {
        const created = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        const id = created.body.leaves[0].id;
        const noSigner = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved' });
        expect(noSigner.status).toBe(400);
        const emptyArray = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved', approved_by: [] });
        expect(emptyArray.status).toBe(400);
        const badSigner = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved', approved_by: 'Random Person' });
        expect(badSigner.status).toBe(400);
        const oneBadOneGood = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Approved', approved_by: ['Admin', 'Random Person'] });
        expect(oneBadOneGood.status).toBe(400);
    });

    test('rejects a status that is none of Pending/Approved/Rejected, and an unknown id', async () => {
        const created = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        const id = created.body.leaves[0].id;
        const bad = await request(app).patch(`/api/leaves/${id}`).send({ status: 'Cancelled' });
        expect(bad.status).toBe(400);
        const missing = await request(app).patch('/api/leaves/00000000-0000-0000-0000-000000000000').send({ status: 'Approved', approved_by: 'Admin' });
        expect(missing.status).toBe(404);
    });
});

describe('leavesBetween (used by the monthly report and absent list)', () => {
    test('a Rejected leave is excluded — that day goes back to being a plain absence', async () => {
        const a = await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-16', to: '2026-09-16', type: 'CL' });
        await request(app).post('/api/leaves/range').send({ employee_id: 'EL107', from: '2026-09-17', to: '2026-09-17', type: 'SL' });
        await request(app).patch(`/api/leaves/${a.body.leaves[0].id}`).send({ status: 'Rejected', approved_by: 'Shreya mam' });
        const rows = await leavesBetween('2026-09-01', '2026-09-30');
        expect(rows.map(r => r.date)).toEqual(['2026-09-17']);
        expect(rows.map(r => r.date)).not.toContain('2026-09-16');
    });
});
