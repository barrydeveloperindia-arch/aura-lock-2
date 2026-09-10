/**
 * Rename employee IDs everywhere they are referenced.
 *
 *   node scripts/rename_employee_ids.js                 # dry run: show what would change
 *   node scripts/rename_employee_ids.js --apply         # do it (backup written to backend/backups/)
 *   node scripts/rename_employee_ids.js --map "Old=NEW;Old2=NEW2" [--apply]
 *
 * Touches: employees.employee_id, access_logs.employee_id (text EID),
 * face_encodings.employee_id (engine re-reads it within 60 s), security_alerts.employee_id, and the avatar
 * file avatars/<id>.jpg. attendance rows key on the employee UUID, so they
 * are unaffected. The terminal re-syncs its local face list every 5 minutes.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const mapArg = process.argv[process.argv.indexOf('--map') + 1];
const DEFAULT_MAP = { 'Eng_dharm': 'EMP-041', 'Amresh': 'EMP-042' };
const MAP = process.argv.includes('--map')
    ? Object.fromEntries(mapArg.split(';').map(p => p.split('=').map(s => s.trim())).filter(([a, b]) => a && b))
    : DEFAULT_MAP;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BUCKET = 'attendance-photos';
const PLAIN_FK_TABLES = ['face_encodings', 'security_alerts'];

(async () => {
    const { data: all, error } = await sb.from('employees').select('id, employee_id, name, status, is_deleted');
    if (error) throw error;
    const byId = new Map(all.map(e => [e.employee_id, e]));
    const taken = new Set(all.map(e => e.employee_id.toUpperCase()));
    const plan = [];
    for (const [from, to] of Object.entries(MAP)) {
        const emp = byId.get(from);
        if (!emp) { console.log(`skip ${from}: no such employee`); continue; }
        if (!/^EMP-\d{3}$/.test(to)) { console.log(`skip ${from}: target ${to} is not EMP-###`); continue; }
        if (taken.has(to.toUpperCase()) && from.toUpperCase() !== to.toUpperCase()) { console.log(`skip ${from}: ${to} is already used`); continue; }
        const count = async (t) => (await sb.from(t).select('*', { count: 'exact', head: true }).eq('employee_id', from)).count || 0;
        const { data: av } = await sb.storage.from(BUCKET).list('avatars', { search: from });
        plan.push({ from, to, uuid: emp.id, name: emp.name.trim(), access_logs: await count('access_logs'), face_encodings: await count('face_encodings'), avatar: (av || []).some(f => f.name === `${from}.jpg`) });
    }
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${plan.length} rename(s)`);
    for (const p of plan) console.log(`  ${p.from} -> ${p.to}  ${p.name}  | access_logs ${p.access_logs} | face_encodings ${p.face_encodings} | avatar ${p.avatar ? 'yes' : 'no'}`);
    if (!APPLY || plan.length === 0) return;

    const dir = path.join(__dirname, '..', 'backups'); fs.mkdirSync(dir, { recursive: true });
    const faceBackup = {};
    for (const p of plan) faceBackup[p.from] = (await sb.from('face_encodings').select('*').eq('employee_id', p.from)).data;
    fs.writeFileSync(path.join(dir, `employee-ids-${Date.now()}.json`), JSON.stringify({ plan, face_encodings: faceBackup }, null, 2));

    for (const p of plan) {
        const step = async (label, fn) => { const { error: e } = await fn(); console.log(`  ${p.to} ${label}: ${e ? 'FAILED ' + e.message : 'ok'}`); if (e) throw e; };
        // These tables have a plain FK to employees (no cascade): lift their rows out, rename, put them back
        // with the new id. If any step fails the lifted rows are put back under the old id, so nothing is lost.
        const lifted = {};
        for (const t of PLAIN_FK_TABLES) {
            const { data, error: lErr } = await sb.from(t).select('*').eq('employee_id', p.from);
            if (lErr) throw lErr;
            lifted[t] = data || [];
        }
        try {
            for (const t of PLAIN_FK_TABLES) if (lifted[t].length) await step(`${t} lift (${lifted[t].length})`, () => sb.from(t).delete().eq('employee_id', p.from));
            await step('employees (access_logs follow by cascade)', () => sb.from('employees').update({ employee_id: p.to }).eq('id', p.uuid));
            await step(`access_logs (${p.access_logs})`, () => sb.from('access_logs').update({ employee_id: p.to }).eq('employee_id', p.from));
            for (const t of PLAIN_FK_TABLES) if (lifted[t].length) await step(`${t} restore`, () => sb.from(t).insert(lifted[t].map(f => ({ ...f, employee_id: p.to }))));
        } catch (e) {
            for (const t of PLAIN_FK_TABLES) if (lifted[t].length) {
                const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).eq('employee_id', p.from);
                if (!count) { const { error: rErr } = await sb.from(t).insert(lifted[t]); console.log(`  ${p.from} ${t} put back under old id: ${rErr ? 'FAILED ' + rErr.message : 'ok'}`); }
            }
            throw e;
        }
        if (p.avatar) await step('avatar file', () => sb.storage.from(BUCKET).move(`avatars/${p.from}.jpg`, `avatars/${p.to}.jpg`));
    }
    console.log('done. Backup in backend/backups/. The engine picks up the new IDs within 60 s.');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
