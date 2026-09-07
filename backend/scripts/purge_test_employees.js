/**
 * Permanently remove TEST employees (and only those) with everything that
 * references them. Real ex-staff stay soft-deleted so their attendance
 * history survives.
 *
 *   node scripts/purge_test_employees.js            # dry run
 *   node scripts/purge_test_employees.js --apply    # delete, with a JSON backup in backend/backups/
 *
 * A row is a test record only if ALL of these hold: is_deleted = true,
 * zero attendance rows, and the id or name looks like a test entry.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const TEST_ID = /^(TEST-|EMP-1{5,}|EMP-121$|EMP-12112$|EMP-11111$)/i;
const TEST_NAME = /^(test|test-\d+|testing|test user.*|angad)$/i;

(async () => {
    const { data: all, error } = await sb.from('employees').select('id, employee_id, name, status, is_deleted, created_at');
    if (error) throw error;
    const candidates = [];
    for (const e of all) {
        const name = e.name.trim();
        if (!e.is_deleted) continue;
        if (!(TEST_ID.test(e.employee_id) || TEST_NAME.test(name))) continue;
        const { count: att } = await sb.from('attendance').select('*', { count: 'exact', head: true }).eq('employee_id', e.id);
        if (att > 0) { console.log(`skip ${e.employee_id} (${name}): has ${att} attendance rows`); continue; }
        const { count: logs } = await sb.from('access_logs').select('*', { count: 'exact', head: true }).eq('employee_id', e.employee_id);
        const { count: faces } = await sb.from('face_encodings').select('*', { count: 'exact', head: true }).eq('employee_id', e.employee_id);
        candidates.push({ uuid: e.id, employee_id: e.employee_id, name, logs: logs || 0, faces: faces || 0, created_at: e.created_at });
    }
    console.log(`${APPLY ? 'DELETING' : 'DRY RUN'}: ${candidates.length} test employee(s)`);
    for (const c of candidates) console.log(`  ${c.employee_id} | ${c.name} | access_logs ${c.logs} | face_encodings ${c.faces}`);
    if (!APPLY || candidates.length === 0) return;

    // full backup of every row that is about to go
    const backup = { employees: [], access_logs: [], face_encodings: [] };
    for (const c of candidates) {
        backup.employees.push(...(await sb.from('employees').select('*').eq('id', c.uuid)).data);
        backup.access_logs.push(...(await sb.from('access_logs').select('*').eq('employee_id', c.employee_id)).data);
        backup.face_encodings.push(...(await sb.from('face_encodings').select('*').eq('employee_id', c.employee_id)).data);
    }
    const dir = path.join(__dirname, '..', 'backups'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `test-employees-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(backup, null, 2));
    console.log(`backup: ${file}`);

    for (const c of candidates) {
        const step = async (label, fn) => { const { error: e } = await fn(); console.log(`  ${c.employee_id} ${label}: ${e ? 'FAILED ' + e.message : 'ok'}`); if (e) throw e; };
        await step('access_logs', () => sb.from('access_logs').delete().eq('employee_id', c.employee_id));
        await step('face_encodings', () => sb.from('face_encodings').delete().eq('employee_id', c.employee_id));
        await step('employee', () => sb.from('employees').delete().eq('id', c.uuid));
    }
    console.log('done.');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
