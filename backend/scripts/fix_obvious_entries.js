/**
 * 11 Sep 2026 clean-up of entries that are visibly wrong in the staff list.
 * Wrong e-mails are CLEARED (not guessed); real ones come from the accounts team.
 *
 *   node scripts/fix_obvious_entries.js          # dry run
 *   node scripts/fix_obvious_entries.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');
const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const FIXES = {
    'EMP-043': { email: null, why: 'e-mail was a broken copy of Gaurav Panchal\'s address' },     // Hafeez
    'EMP-044': { email: null, why: 'e-mail was the owner\'s own address' },                        // Bhawna
    'EMP-023': { email: null, why: 'e-mail was test@gmail.com' },                                 // Veermati
    'EMP-042': { name: 'Amresh', why: 'department text was inside the name' },                    // Amresh house keeping
    'EMP-047': { name: 'Kevel', why: '"sky 5" (the sister business) was inside the name' },       // Kevel sky 5
    'EMP-040': { name: 'Larissa', why: 'honorific "mam" was inside the name' },                   // Larissa mam
    'EMP-025': { name: 'CB Anand', why: 'name was all caps' },                                    // CB ANAND
    'EMP-045': { name: 'Ashish Kumar', why: 'surname was lower-case' },                           // Ashish kumar
};

(async () => {
    const ids = Object.keys(FIXES);
    const { data: rows, error } = await sb.from('employees').select('id, employee_id, name, email').in('employee_id', ids);
    if (error) throw error;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${rows.length} of ${ids.length} found`);
    for (const r of rows) {
        const { why, ...patch } = FIXES[r.employee_id];
        const changes = Object.entries(patch).filter(([k, v]) => (r[k] ?? null) !== v);
        if (!changes.length) { console.log(`  ${r.employee_id} ${r.name}: already fixed`); continue; }
        console.log(`  ${r.employee_id} ${r.name}: ` + changes.map(([k, v]) => `${k} "${r[k] ?? ''}" -> "${v ?? ''}"`).join(', ') + `  (${why})`);
        if (!APPLY) continue;
        let { error: uErr } = await sb.from('employees').update({ ...Object.fromEntries(changes), updated_at: new Date().toISOString() }).eq('id', r.id);
        if (uErr && 'email' in patch && /null/i.test(uErr.message)) {
            ({ error: uErr } = await sb.from('employees').update({ ...Object.fromEntries(changes), email: '', updated_at: new Date().toISOString() }).eq('id', r.id));
        }
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
