/**
 * Regression tests for db helpers.
 *  - logAccess: access_logs has no `method` column; rows carrying it were rejected
 *    by PostgREST and silently lost (audit 7 Sep 2026).
 *  - fetchAll: PostgREST caps un-ranged selects at 1000 rows; exports and reports
 *    were silently truncated.
 */
const { logAccess, fetchAll, likeLiteral, PAGE } = require('./db');

function fakeSupabase({ insertError = null } = {}) {
    const inserted = [];
    return {
        inserted,
        from: (table) => ({
            insert: async (row) => { inserted.push({ table, row }); return { error: insertError }; },
        }),
    };
}

describe('logAccess', () => {
    test('moves method into metadata and never sends a method column', async () => {
        const sb = fakeSupabase();
        const ok = await logAccess(sb, { employee_id: 'EMP-012', status: 'failed', device_id: 'terminal_01', method: 'face', metadata: { reason: 'x' } });
        expect(ok).toBe(true);
        expect(sb.inserted).toHaveLength(1);
        const row = sb.inserted[0].row;
        expect(row).not.toHaveProperty('method');
        expect(row.metadata).toEqual({ method: 'FACE', reason: 'x' });
        expect(row.employee_id).toBe('EMP-012');
    });
    test('returns false (does not throw) when the insert is rejected', async () => {
        const sb = fakeSupabase({ insertError: { message: 'nope' } });
        await expect(logAccess(sb, { status: 'failed' })).resolves.toBe(false);
    });
});

describe('fetchAll', () => {
    test('keeps paging until a short page arrives', async () => {
        const total = PAGE * 2 + 5;
        const calls = [];
        const build = () => ({
            range: async (from, to) => { calls.push([from, to]); const data = []; for (let i = from; i <= Math.min(to, total - 1); i++) data.push({ i }); return { data, error: null }; },
        });
        const rows = await fetchAll(build);
        expect(rows).toHaveLength(total);
        expect(calls).toEqual([[0, PAGE - 1], [PAGE, 2 * PAGE - 1], [2 * PAGE, 3 * PAGE - 1]]);
    });
    test('surfaces Supabase errors', async () => {
        await expect(fetchAll(() => ({ range: async () => ({ data: null, error: new Error('boom') }) }))).rejects.toThrow('boom');
    });
});

test('likeLiteral escapes LIKE wildcards in employee ids', () => {
    expect(likeLiteral('Eng_dharm')).toBe('Eng\\_dharm');
    expect(likeLiteral('100%')).toBe('100\\%');
});
