/**
 * Attendance clean-up: merge duplicate rows and remove test data.
 *
 *   node scripts/clean_attendance.js              # dry run: prints what WOULD change
 *   node scripts/clean_attendance.js --apply      # merge duplicates (keep 1 row per employee per day)
 *   node scripts/clean_attendance.js --apply --test-data   # also delete rows from test accounts / test devices
 *
 * Duplicates: several camera frames used to reach the server within the same
 * second and the "does today's row exist?" check raced with the insert, so one
 * employee-day could have 2..200 rows. For each group we keep ONE row
 * (a row that owns photos if any, else the earliest), set its check_in to the
 * earliest, check_out to the latest, working_hours recomputed, and delete the rest.
 *
 * Test data: attendance rows of employees whose name matches /test/i.
 *
 * A full JSON backup of every affected row is written to backups/ before any
 * change. Restore = re-insert the deleted rows from that file.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const TEST_DATA = process.argv.includes('--test-data');
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const s = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } });

async function fetchAll(table, select) {
    let all = [], from = 0;
    for (;;) {
        const { data, error } = await s.from(table).select(select).range(from, from + 999);
        if (error) throw new Error(`${table}: ${error.message}`);
        all = all.concat(data || []);
        if (!data || data.length < 1000) break;
        from += 1000;
    }
    return all;
}

async function photoOwners() {
    const ids = new Set();
    const { data: folders } = await s.storage.from('attendance-photos').list('', { limit: 1000 });
    for (const f of folders || []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name)) continue;
        const { data: files } = await s.storage.from('attendance-photos').list(f.name, { limit: 1000 });
        for (const x of files || []) { const m = /^([0-9a-f-]{36})_/.exec(x.name); if (m) ids.add(m[1]); }
    }
    return ids;
}

(async () => {
    const rows = await fetchAll('attendance', '*');
    const emps = await fetchAll('employees', 'id,employee_id,name,is_deleted');
    const empById = new Map(emps.map(e => [e.id, e]));
    const owners = await photoOwners();
    console.log(`attendance rows: ${rows.length} | employees: ${emps.length} | rows with photos: ${owners.size}`);

    // ── 1. duplicate groups ──────────────────────────────────────────────
    const groups = new Map();
    for (const r of rows) { const k = `${r.employee_id}|${r.date}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const plan = [];
    for (const [k, g] of groups) {
        if (g.length < 2) continue;
        g.sort((a, b) => new Date(a.check_in || a.created_at) - new Date(b.check_in || b.created_at));
        const keep = g.find(r => owners.has(r.id)) || g[0];
        const ci = g.map(r => r.check_in).filter(Boolean).sort()[0] || null;
        const co = g.map(r => r.check_out).filter(Boolean).sort().slice(-1)[0] || null;
        const wh = ci && co ? Math.round(((new Date(co) - new Date(ci)) / 36e5) * 100) / 100 : null;
        plan.push({ key: k, name: (empById.get(g[0].employee_id)?.name || '?').trim(), keep: keep.id, patch: { check_in: ci, check_out: co, working_hours: wh }, del: g.filter(r => r.id !== keep.id).map(r => r.id) });
    }
    const delCount = plan.reduce((a, p) => a + p.del.length, 0);
    console.log(`\n1. DUPLICATES: ${plan.length} employee-days, ${delCount} rows to delete`);
    for (const p of plan.slice(0, 8)) console.log(`   ${p.name} ${p.key.split('|')[1]}: ${p.del.length + 1} rows -> 1`);
    if (plan.length > 8) console.log(`   ... and ${plan.length - 8} more`);

    // ── 2. test data ─────────────────────────────────────────────────────
    const testRows = rows.filter(r => {
        const e = empById.get(r.employee_id);
        return e && /test/i.test(e.name || ''); // only test ACCOUNTS; real staff rows from a test device are kept
    });
    const keepIds = new Set(plan.map(p => p.keep));
    console.log(`\n2. TEST DATA: ${testRows.length} rows (test accounts / test_device)`);
    const byName = {};
    testRows.forEach(r => { const n = (empById.get(r.employee_id)?.name || r.device_id || '?').trim(); byName[n] = (byName[n] || 0) + 1; });
    for (const [n, c] of Object.entries(byName)) console.log(`   ${n}: ${c}`);

    if (!APPLY) { console.log('\nDry run only. Re-run with --apply (and --test-data) to change the database.'); return; }

    // ── backup ───────────────────────────────────────────────────────────
    const affected = new Set([...plan.flatMap(p => [p.keep, ...p.del]), ...(TEST_DATA ? testRows.map(r => r.id) : [])]);
    const backupDir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, `attendance_cleanup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ taken_at: new Date().toISOString(), plan, testRows: TEST_DATA ? testRows : [], rows: rows.filter(r => affected.has(r.id)) }, null, 1));
    console.log(`\nbackup written: ${backupFile} (${affected.size} rows)`);

    // ── apply ────────────────────────────────────────────────────────────
    let updated = 0, deleted = 0, errors = 0;
    for (const p of plan) {
        const { error: e1 } = await s.from('attendance').update(p.patch).eq('id', p.keep);
        if (e1) { errors++; console.log('update failed', p.key, e1.message); continue; }
        updated++;
        for (let i = 0; i < p.del.length; i += 100) {
            const chunk = p.del.slice(i, i + 100);
            const { error: e2 } = await s.from('attendance').delete().in('id', chunk);
            if (e2) { errors++; console.log('delete failed', p.key, e2.message); } else deleted += chunk.length;
        }
    }
    console.log(`duplicates: kept+updated ${updated}, deleted ${deleted}, errors ${errors}`);

    if (TEST_DATA) {
        const ids = testRows.map(r => r.id).filter(id => !keepIds.has(id) || true);
        let td = 0;
        for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            const { error } = await s.from('attendance').delete().in('id', chunk);
            if (error) { errors++; console.log('test-data delete failed', error.message); } else td += chunk.length;
        }
        console.log(`test data: deleted ${td} rows`);
    }
    const { count } = await s.from('attendance').select('*', { count: 'exact', head: true });
    console.log(`attendance rows now: ${count}`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
