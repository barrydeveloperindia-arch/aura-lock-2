/**
 * Apply designation + joining date from the accounts team's Tally "Employees Profile"
 * register (15 Sep 2026 screenshots) to matching attendance employees.
 *
 * Deliberately excludes PAN, Aadhaar, bank details, DOB, blood group, father/mother/spouse --
 * see migration_v12_employee_profile.sql for why. Only 12 of the 26 Tally rows have a clear
 * name match to an existing active attendance employee; the rest (Cleaning Lady, Devanshu
 * Madke, Gurpreet, Kartik Jangra, Monal Intern, Monal Saini, Parveen Kumar, Prashant Rai,
 * Rohit Kohli, Rohit Verma, Shallu, Uditanshu) are not enrolled in this system at all, and are
 * skipped rather than guessed at.
 *
 *   node scripts/apply_tally_profile_v2.js          # dry run
 *   node scripts/apply_tally_profile_v2.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// key = current employee_id in the attendance DB
const UPDATES = {
    'EL107': { designation: 'Land Survey Cad Technician', joining_date: '2023-10-13' },   // Gaurav Panchal
    'EL200': { designation: 'Autocad Draftsman Civil', joining_date: '2024-01-01' },       // Jamshed Ahmed
    'EL021': { designation: 'Painter' },                                                    // Kunwar Lal (Tally: "Kuwarlal")
    'EL101': { designation: 'Painter' },                                                    // Ram Kumar
    'EL1111': { designation: 'Accountant' },                                                // Ratnesh Dwivedi
    'EL024': { designation: 'Mechanical Engineer', joining_date: '2022-01-13' },           // Shubham Kumar
    'EL066': { designation: 'Accountant', joining_date: '2022-12-16' },                    // Sunny Singla
    'EL065': { designation: 'Post-Processor' },                                             // Thakur Parshad (Tally: "Thakur Prasad")
    'EL020': { joining_date: '2024-10-16' },                                                // Rajinder (no Employee Number in Tally; real employee_id EL020)
    'EL009': { joining_date: '2025-04-01' },                                                // Kusum (no Employee Number in Tally; real employee_id EL009)
    'EL018': { designation: 'Manager', joining_date: '2024-05-03' },                        // Anurag Sahni (no Employee Number in Tally; real employee_id EL018)
    'EL012': { designation: 'Post-Processor', joining_date: '2023-04-01' },                // Arjun Tiwari -- see note below
};
// NOTE: Tally's "Arjun" row has a BLANK Employee Number, not EL012. EL012 was assigned to
// Arjun Tiwari in this system on 11 Sep from an earlier, smaller Tally view. This full 26-row
// export doesn't show EL012 on any row -- flag this to the user rather than silently trust it.
console.log('⚠ Flag for the user: Tally shows no Employee Number for "Arjun" (blank), but this system has Arjun Tiwari = EL012. Please confirm his real Employee Number.');

(async () => {
    const ids = Object.keys(UPDATES);
    const { data: rows, error } = await sb.from('employees').select('id, employee_id, name, designation, joining_date').in('employee_id', ids);
    if (error) throw error;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${rows.length} of ${ids.length} employees found`);
    for (const r of rows) {
        const patch = UPDATES[r.employee_id];
        const changes = Object.entries(patch).filter(([k, v]) => (r[k] || null) !== v);
        if (!changes.length) { console.log(`  ${r.employee_id} ${r.name}: already up to date`); continue; }
        console.log(`  ${r.employee_id} ${r.name}: ` + changes.map(([k, v]) => `${k} "${r[k] || ''}" -> "${v}"`).join(', '));
        if (!APPLY) continue;
        const { error: uErr } = await sb.from('employees').update({ ...Object.fromEntries(changes), updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
    for (const id of ids) if (!rows.find(r => r.employee_id === id)) console.log(`  ${id}: not found, skipped`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
