/**
 * Standardize employee_id codes to the "EL###" convention (already used by 36 of 54
 * employees, including every ID matched from the Tally export on 15 Sep 2026). 18 employees
 * still carry legacy formats (EMP-001, Emp-022, ENG_0001, Eng-2222, etc.) from earlier data
 * entry. attendance/leaves link employees by their internal UUID, not this display code, so
 * renaming it does not affect attendance history.
 *
 *   node scripts/rename_legacy_employee_ids.js          # dry run
 *   node scripts/rename_legacy_employee_ids.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const RENAMES = {
    'EMP-001': 'EL001',    // Shiv Kumar
    'EMP-002': 'EL002',    // C B Anand
    'EMP-003': 'EL003',    // Bharat Anand
    'EMP-010': 'EL005',    // Devanshu Madke
    'EMP-015': 'EL006',    // Uditanshu Chandel
    'Emp-022': 'EL008',    // Nisha
    'EMP-024': 'EL010',    // Neeraj
    'Emp-027': 'EL013',    // Sethi ji
    'Emp-028': 'EL014',    // Himanshu
    'EMP-19': 'EL015',     // Karan
    'ENG_0001': 'EL016',   // Gurpreet Singh
    'ENG_0006': 'EL019',   // Roof house keeping
    'Eng_1111': 'EL022',   // Mohini
    'Eng_444': 'EL026',    // Soni
    'Eng_456': 'EL027',    // Ajay Tiwari
    'Eng-09754': 'EL028',  // Bhawna new
    'Eng-2222': 'EL036',   // Shivam
    'Eng-666': 'EL037',    // Lariss mam
};

(async () => {
    console.log(APPLY ? 'APPLYING' : 'DRY RUN');
    for (const [oldId, newId] of Object.entries(RENAMES)) {
        const { data: rows, error } = await sb.from('employees').select('id, name, employee_id').eq('employee_id', oldId);
        if (error) throw error;
        if (!rows.length) { console.log(`  ${oldId}: not found, skipped`); continue; }
        const r = rows[0];
        console.log(`  ${oldId} -> ${newId} (${r.name})`);
        if (!APPLY) continue;
        const { error: uErr } = await sb.from('employees').update({ employee_id: newId, updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
