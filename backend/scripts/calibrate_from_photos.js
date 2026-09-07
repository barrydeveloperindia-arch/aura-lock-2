/**
 * Preliminary face-threshold calibration from photos we already have.
 *
 * Every attendance photo is a labelled sample: the attendance row says who it
 * was. Each one is sent to the engine's measure endpoint (no side effects) and
 * stored as a calibration row, so the admin "Face Calibration" page shows a
 * first picture before the live session with staff:
 *   genuine  = distance to the right person
 *   impostor = the same frame's distance to the NEAREST OTHER enrolled face
 *              (a "zero-effort impostor": how close a colleague's face gets)
 *
 *   node scripts/calibrate_from_photos.js [--dates 2026-09-07,2026-09-06] [--engine URL] [--session photos-2026-09-07] [--apply]
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');
const { buildReport } = require('../src/lib/calibration');

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const APPLY = process.argv.includes('--apply');
const ENGINE = arg('--engine', process.env.PYTHON_ENGINE_URL);
const DATES = arg('--dates', new Date().toISOString().slice(0, 10)).split(',');
const SESSION = arg('--session', `photos-${DATES[0]}`);
const BUCKET = 'attendance-photos';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
    if (!process.env.ENGINE_KEY) throw new Error('ENGINE_KEY missing in .env');
    const rows = [];
    for (const date of DATES) {
        const { data: files, error } = await sb.storage.from(BUCKET).list(date, { limit: 1000 });
        if (error) throw error;
        const photos = (files || []).filter(f => /^[0-9a-f-]{36}_(in|out)\.jpg$/.test(f.name));
        const ids = [...new Set(photos.map(f => f.name.slice(0, 36)))];
        const { data: att } = await sb.from('attendance').select('id, employees(employee_id, name)').in('id', ids);
        const who = new Map((att || []).map(a => [a.id, a.employees]));
        console.log(`${date}: ${photos.length} photos, ${who.size} attendance rows`);
        for (const f of photos) {
            const emp = who.get(f.name.slice(0, 36));
            if (!emp) continue;
            const { data: blob, error: dErr } = await sb.storage.from(BUCKET).download(`${date}/${f.name}`);
            if (dErr || !blob) continue;
            const form = new FormData();
            form.append('file', Buffer.from(await blob.arrayBuffer()), { filename: f.name, contentType: 'image/jpeg' });
            let m;
            try {
                m = (await axios.post(`${ENGINE}/api/biometrics/face/measure`, form, { headers: { ...form.getHeaders(), 'X-Engine-Key': process.env.ENGINE_KEY }, timeout: 60000 })).data;
            } catch (e) { console.log(`  ${f.name}: engine error ${e.response?.status || e.message}`); continue; }
            const kind = f.name.endsWith('_in.jpg') ? 'in' : 'out';
            const base = { at: new Date().toISOString(), session: SESSION, claimed_id: emp.employee_id.toUpperCase(), claimed_name: emp.name.trim(), condition: `photo-${kind}`, by: 'calibrate_from_photos', source_photo: `${date}/${f.name}`, threshold_at_time: m.threshold ?? null };
            if (!m.face_found) { rows.push({ ...base, face_found: false, matched_id: null, distance: null }); console.log(`  ${emp.employee_id} ${kind}: no face`); continue; }
            rows.push({ ...base, face_found: true, matched_id: m.best.employee_id, matched_name: m.best.name, distance: m.best.distance, second_id: m.second?.employee_id || null, second_distance: m.second?.distance ?? null, gap: m.gap, would_pass: m.would_pass });
            // the nearest OTHER person is an impostor sample for this frame
            const other = (m.top || []).find(t => t.employee_id.toUpperCase() !== emp.employee_id.toUpperCase());
            if (other) rows.push({ ...base, condition: `impostor-proxy-${kind}`, claimed_id: '', claimed_name: `nearest other to ${emp.name.trim()}`, face_found: true, matched_id: other.employee_id, matched_name: other.name, distance: other.distance, would_pass: other.distance <= (m.threshold ?? 0.9) });
            const ok = m.best.employee_id.toUpperCase() === emp.employee_id.toUpperCase();
            console.log(`  ${emp.employee_id.padEnd(8)} ${kind.padEnd(3)} -> ${m.best.employee_id.padEnd(8)} d=${m.best.distance.toFixed(3)} 2nd=${(m.second?.distance ?? 0).toFixed(3)} ${ok ? 'ok' : 'WRONG PERSON'}`);
        }
    }
    const report = buildReport(rows, rows.find(r => r.threshold_at_time != null)?.threshold_at_time ?? null);
    console.log('\nREPORT');
    console.log('  genuine :', report.genuine);
    console.log('  impostor:', report.impostor);
    console.log('  misidentified:', report.misidentified, '| no face:', report.no_face);
    console.log('  at current threshold', report.current_threshold, ': false accepts', report.current_false_accepts, 'false rejects', report.current_false_rejects);
    console.log('  suggestion:', report.suggestion);
    if (!APPLY) { console.log(`\n(dry run: add --apply to store ${rows.length} rows as session "${SESSION}")`); return; }
    const { error: upErr } = await sb.storage.from(BUCKET).upload(`calibration/${SESSION}.json`, Buffer.from(JSON.stringify(rows)), { contentType: 'application/json', upsert: true, cacheControl: '0' });
    if (upErr) throw upErr;
    console.log(`stored ${rows.length} rows as session "${SESSION}" (open Face Calibration, session field = ${SESSION})`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
