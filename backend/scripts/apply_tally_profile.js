/**
 * Apply the accounts team's Tally "Employees Profile" (11 Sep 2026) to the
 * attendance employees table: real names and e-mail addresses. Employee
 * numbers are renamed separately with rename_employee_ids.js.
 *
 *   node scripts/apply_tally_profile.js          # dry run
 *   node scripts/apply_tally_profile.js --apply
 *
 * Only staff who exist in both systems are touched. PAN, Aadhaar and bank
 * details from the same register are deliberately NOT stored here.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// key = current employee_id in the attendance DB
const UPDATES = {
    'EMP-018': { name: 'Anurag Sahni', email: 'sahni.anurag50@gmail.com' },
    'EMP-013': { email: 'arjuntiwari0306@gmail.com' },
    'EMP-021': { name: 'Jamshed Ahmed', email: 'jamshedahmed688@gmail.com' },
    'EMP-008': { email: 'kl5735831@gmail.com' },
    'EMP-014': { name: 'Ram Kumar', email: 'preetak393@gmail.com' },
    'EMP-016': { name: 'Ratnesh Dwivedi' },
    'EMP-006': { name: 'Shubham Kumar', email: 'shubhamrohillaz867@gmail.com' },
    'EMP-026': { name: 'Sunny Singla', email: 'sunnysingla550@gmail.com' },
    'EMP-005': { email: 'thakurparshad70@gmail.com' },
    'EL107': { email: 'gauravpanchalvishwakarma0001@gmail.com' },
};

(async () => {
    const ids = Object.keys(UPDATES);
    const { data: rows, error } = await sb.from('employees').select('id, employee_id, name, email').in('employee_id', ids);
    if (error) throw error;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${rows.length} of ${ids.length} employees found`);
    for (const r of rows) {
        const patch = UPDATES[r.employee_id];
        const changes = Object.entries(patch).filter(([k, v]) => (r[k] || '') !== v);
        if (!changes.length) { console.log(`  ${r.employee_id} ${r.name}: already up to date`); continue; }
        console.log(`  ${r.employee_id} ${r.name}: ` + changes.map(([k, v]) => `${k} "${r[k] || ''}" -> "${v}"`).join(', '));
        if (!APPLY) continue;
        const { error: uErr } = await sb.from('employees').update({ ...Object.fromEntries(changes), updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
    for (const id of ids) if (!rows.find(r => r.employee_id === id)) console.log(`  ${id}: not found, skipped`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
