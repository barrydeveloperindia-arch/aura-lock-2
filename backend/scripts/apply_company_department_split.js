/**
 * Splits "which company" (a Disha Arcade building tenant) out of `department`, which had been
 * reused to carry the company name for staff belonging to Sky5 Hotel / A & A Architect / Bright
 * Kids School -- overwriting their real internal department in the process. This restores each
 * person's original department (from the last known-good scan, 15 Sep 2026, before the
 * overwrite) and sets `company` correctly for everyone, including the Englabs-only staff who
 * never had it touched.
 *
 *   node scripts/apply_company_department_split.js          # dry run
 *   node scripts/apply_company_department_split.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const ENGLABS = 'Englabs India Pvt Ltd';

// employee_id -> { company, department } for everyone whose department currently holds a
// company name (or, for the three Englabs CEOs, "EngLabs" literal) instead of their real dept.
const OVERRIDES = {
    'EL010': { company: 'A & A Architect', department: 'Architecture' },      // Neeraj
    'EL035': { company: 'A & A Architect', department: 'MD' },                 // Swati Anand
    'EL007': { company: 'A & A Architect', department: 'Management' },         // Parmod Bahl
    'EL031': { company: 'A & A Architect', department: 'Architecture' },      // Sahil
    'EL025': { company: 'A & A Architect', department: 'MD' },                 // C. B. Anand
    'EL200': { company: 'A & A Architect', department: 'Civil Engineering' }, // Jamshed Ahmed
    'EL039': { company: 'Bright Kids School', department: 'House Keeping' },  // Amir Khan
    'EL042': { company: 'Bright Kids School', department: 'House Keeping' },  // Amresh
    'EL029': { company: 'Bright Kids School', department: 'Mechanical Engineering' }, // Sophia
    'EL034': { company: 'Bright Kids School', department: 'Mechanical Engineering' }, // Kabir
    'EL123': { company: 'Bright Kids School', department: 'Cleaning' },       // Neetu Kumar
    'EL033': { company: 'Sky5 Hotel', department: 'Cleaning' },                // Varun
    'EL023': { company: 'Sky5 Hotel', department: 'Cleaning' },                // Veermati
    'EL043': { company: 'Sky5 Hotel', department: 'Maintenance' },             // Hafeez
    'EL040': { company: 'Sky5 Hotel', department: 'CEO' },                     // Larissa
    'EL047': { company: 'Sky5 Hotel', department: 'Management' },              // Kevel
    'EL004': { company: ENGLABS, department: 'Management' },                   // Shreeya
    'EL999': { company: ENGLABS, department: 'CEO' },                          // Bharat Anand
    'EL017': { company: ENGLABS, department: 'CEO' },                          // Salil Anand
};

(async () => {
    // 1. Everyone active gets company = Englabs by default.
    const { data: allActive, error: e1 } = await sb.from('employees').select('id, employee_id').eq('is_deleted', false).eq('status', 'Active');
    if (e1) throw e1;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${allActive.length} active employees, defaulting company to "${ENGLABS}"`);
    if (APPLY) {
        const { error } = await sb.from('employees').update({ company: ENGLABS }).eq('is_deleted', false).eq('status', 'Active');
        if (error) throw error;
    }

    // 2. Overrides: real company + restored department for the 19 building-mates / Englabs CEOs.
    const ids = Object.keys(OVERRIDES);
    const { data: rows, error: e2 } = await sb.from('employees').select('id, employee_id, name, department').in('employee_id', ids);
    if (e2) throw e2;
    for (const r of rows) {
        const patch = OVERRIDES[r.employee_id];
        console.log(`  ${r.employee_id} ${r.name}: department "${r.department}" -> "${patch.department}", company -> "${patch.company}"`);
        if (!APPLY) continue;
        const { error } = await sb.from('employees').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${error ? 'FAILED ' + error.message : 'ok'}`);
    }
    for (const id of ids) if (!rows.find(r => r.employee_id === id)) console.log(`  ${id}: not found, skipped`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
