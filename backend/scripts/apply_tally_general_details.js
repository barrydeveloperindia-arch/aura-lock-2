/**
 * Apply the "General Details" panel (DOB, gender, blood group, father/mother name, PAN,
 * Aadhaar) from the accounts team's Tally register (15 Sep 2026 screenshot) to matching
 * attendance employees. Only rows with a full, unambiguous data block are included here --
 * rows where the register showed just a bare "Male"/"Female" with nothing else next to it
 * were skipped rather than risk mis-reading which row it belonged to.
 *
 * Kartik Jangra, Monal Intern, Parveen Kumar and Rohit Verma have clear data in Tally too,
 * but none of them has an account in this attendance system at all -- nothing to update.
 *
 *   node scripts/apply_tally_general_details.js          # dry run
 *   node scripts/apply_tally_general_details.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const UPDATES = {
    'EL018': { // Anurag Sahni
        date_of_birth: '1999-07-05', gender: 'Male', blood_group: 'A Positive', pan_number: 'JIKPS3830K',
    },
    'EL012': { // Arjun Tiwari
        gender: 'Male', pan_number: 'HZSPK0993N', aadhaar_number: '389935705043',
    },
    'EL107': { // Gaurav Panchal
        date_of_birth: '1996-11-26', gender: 'Male', blood_group: 'B Positive', pan_number: 'DQVPP8020D',
    },
    'EL200': { // Jamshed Ahmed
        date_of_birth: '1996-07-04', gender: 'Male', blood_group: 'A Positive', pan_number: 'CCMPA8009H', aadhaar_number: '565830228270',
    },
    'EL1111': { // Ratnesh Dwivedi
        gender: 'Male', pan_number: 'FSLPD0128J',
    },
    'EL024': { // Shubham Kumar
        location: 'Panchkula', date_of_birth: '2002-09-15', gender: 'Male', blood_group: 'O Negative', pan_number: 'JXXPK2307B', aadhaar_number: '663484615196',
    },
    'EL066': { // Sunny Singla
        date_of_birth: '2000-08-24', gender: 'Male', blood_group: 'B Positive', father_mother_name: 'Krishan Singla', pan_number: 'OUCPS7265H', aadhaar_number: '438413122901',
    },
};

(async () => {
    const ids = Object.keys(UPDATES);
    const { data: rows, error } = await sb.from('employees').select('id, employee_id, name, pan_number, aadhaar_number').in('employee_id', ids);
    if (error) throw error;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${rows.length} of ${ids.length} employees found`);
    for (const r of rows) {
        const patch = UPDATES[r.employee_id];
        console.log(`  ${r.employee_id} ${r.name}: ` + Object.entries(patch).map(([k, v]) => `${k}="${v}"`).join(', '));
        if (r.pan_number || r.aadhaar_number) {
            console.log(`    NOTE: already has pan_number/aadhaar_number set -- will overwrite with the Tally values above.`);
        }
        if (!APPLY) continue;
        const { error: uErr } = await sb.from('employees').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
    for (const id of ids) if (!rows.find(r => r.employee_id === id)) console.log(`  ${id}: not found, skipped`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
