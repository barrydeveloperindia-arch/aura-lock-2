/**
 * Regression test for the duplicate-attendance race (audit 7 Sep 2026):
 * several verify requests for the same employee arriving within the same
 * second used to each insert their own row for the day (live data had one
 * employee-day with 204 rows). recordAttendance must serialise per employee and
 * turn the second call into a duplicate/check-out, never a second check-in.
 *
 * Uses an in-memory fake of the supabase query builder; no network.
 */
jest.mock('../../supabase', () => {
    const state = { attendance: [], access_logs: [], employees: [{ id: 'uuid-1', employee_id: 'EMP-001', name: 'Test One', status: 'Active', is_deleted: false }], nextId: 1 };
    const clone = (x) => JSON.parse(JSON.stringify(x));
    function builder(table) {
        const q = { table, filters: [], order: null, limit: null, op: 'select', payload: null, single: false, maybe: false, del: false };
        const api = {
            select() { return api; },
            insert(row) { q.op = 'insert'; q.payload = row; return api; },
            update(row) { q.op = 'update'; q.payload = row; return api; },
            delete() { q.op = 'delete'; return api; },
            eq(col, val) { q.filters.push(r => r[col] === val); return api; },
            ilike(col, val) { q.filters.push(r => String(r[col]).toLowerCase() === String(val).replace(/\\/g, '').toLowerCase()); return api; },
            in(col, vals) { q.filters.push(r => vals.includes(r[col])); return api; },
            order(col, { ascending = true } = {}) { q.order = { col, ascending }; return api; },
            limit(n) { q.limit = n; return api; },
            single() { q.single = true; return api; },
            maybeSingle() { q.maybe = true; return api; },
            then(resolve, reject) { return run().then(resolve, reject); },
        };
        async function run() {
            await new Promise(r => setTimeout(r, 2)); // simulate network latency so races can interleave
            const rows = state[table] || (state[table] = []);
            if (q.op === 'insert') {
                const row = { id: `${table}-${state.nextId++}`, created_at: new Date().toISOString(), ...clone(q.payload) };
                rows.push(row);
                return { data: q.single ? clone(row) : [clone(row)], error: null };
            }
            let hits = rows.filter(r => q.filters.every(f => f(r)));
            if (q.op === 'update') { hits.forEach(r => Object.assign(r, clone(q.payload))); return { data: clone(hits), error: null }; }
            if (q.op === 'delete') { for (const h of hits) rows.splice(rows.indexOf(h), 1); return { data: clone(hits), error: null }; }
            if (q.order) hits.sort((a, b) => (a[q.order.col] > b[q.order.col] ? 1 : -1) * (q.order.ascending ? 1 : -1));
            if (q.limit) hits = hits.slice(0, q.limit);
            if (q.single || q.maybe) return { data: hits[0] ? clone(hits[0]) : null, error: q.single && !hits[0] ? { code: 'PGRST116', message: 'no rows' } : null };
            return { data: clone(hits), error: null };
        }
        return api;
    }
    const supabase = { from: builder, __state: state };
    return supabase;
});

const supabase = require('../../supabase');
const { recordAttendance } = require('./attendanceController');

beforeEach(() => { supabase.__state.attendance.length = 0; supabase.__state.access_logs.length = 0; });

test('five simultaneous scans produce exactly one attendance row', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => recordAttendance('EMP-001', 'face', 'terminal_01')));
    const rows = supabase.__state.attendance;
    expect(rows).toHaveLength(1);
    expect(results.filter(r => r.event === 'check_in')).toHaveLength(1);
    // the others happened within the 2-minute guard, so they are duplicates, not check-ins
    expect(results.filter(r => r.event === 'duplicate')).toHaveLength(4);
    expect(rows[0].date).toBe(require('../lib/attendanceTime').istDateString());
});

test('a later scan updates check-out on the same single row', async () => {
    const first = await recordAttendance('EMP-001', 'face', 'terminal_01');
    // pretend the check-in happened 10 minutes ago so the duplicate guard does not apply
    supabase.__state.attendance[0].check_in = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const second = await recordAttendance('EMP-001', 'face', 'terminal_01');
    expect(first.event).toBe('check_in');
    expect(second.event).toBe('check_out');
    expect(supabase.__state.attendance).toHaveLength(1);
    expect(supabase.__state.attendance[0].check_out).toBeTruthy();
    expect(second.working_hours).toBeGreaterThan(0.1);
});
