/**
 * Apply the "Bank Details" and "Contact Details" panels, plus a few missing joining dates
 * from "Basic Details", from the accounts team's Tally register (15 Sep 2026 screenshots) to
 * matching attendance employees. Only rows that have an existing account in this system are
 * included -- Cleaning Lady, Devanshu Madke, Kartik Jangra, Monal Intern, Monal Saini, Parveen
 * Kumar, Prashant Rai, Rohit Kohli, Rohit Verma, Shallu, Shiv Nayan, Uditanshu(*) have no
 * matching employee record here.
 * (*) "Uditanshu" the bare Tally row has no bank/contact data anyway; "Uditanshu Chandel"
 * (EL006) is a separate, already-enrolled employee and only gets the joining date below.
 *
 *   node scripts/apply_tally_bank_contact.js          # dry run
 *   node scripts/apply_tally_bank_contact.js --apply
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const UPDATES = {
    'EL018': { // Anurag Sahni
        contact_number: '9779874506', bank_name: 'IDFC FIRST Bank (India)', bank_account_number: '10177898202', bank_ifsc: 'IDFB0040401',
    },
    'EL012': { // Arjun Tiwari
        contact_number: '9876484439', bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'CHANDIGARH', bank_account_number: '10128239133', bank_ifsc: 'IDFB0021211',
    },
    'EL107': { // Gaurav Panchal
        contact_number: '9758029253', address: 'House No 17 Harpal Saharanpur, Uttar Pradesh, India, 247001',
        bank_name: 'IDFC FIRST Bank (India)', bank_account_number: '10158836905', bank_ifsc: 'IDFB0021373',
    },
    'EL016': { joining_date: '2026-04-01' }, // Gurpreet Singh -- Basic Details only, no bank/contact given
    'EL200': { // Jamshed Ahmed
        contact_number: '8958787014', address: '#652 Naya gaon Mohali punjab',
        bank_name: 'IDFC FIRST Bank (India)', bank_account_number: '10181477673', bank_ifsc: 'IDFB0040401',
    },
    'EL021': { // Kunwar Lal
        contact_number: '7814792480', bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'Chandigarh', bank_account_number: '10080701542', bank_ifsc: 'IDFB0021218',
    },
    'EL101': { // Ram Kumar
        contact_number: '8727857406', bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'Chandigarh', bank_account_number: '10074823661', bank_ifsc: 'IDFB0021211',
    },
    'EL1111': { // Ratnesh Dwivedi
        bank_name: 'IDFC FIRST Bank (India)', bank_account_number: '10238736795',
    },
    'EL001': { joining_date: '2025-04-01' }, // Shiv Kumar -- Basic Details only, no bank/contact given
    'EL024': { // Shubham Kumar
        contact_number: '7988183752', bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'Mohali', bank_account_number: '10080000863', bank_ifsc: 'IDFB0021371',
    },
    'EL066': { // Sunny Singla
        contact_number: '8699563863', address: 'Flat No 20, Ground Floor, LRC HOMES, Dhakoli, Punjab',
        bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'CHANDIGARH - SECTOR 9D', bank_account_number: '10148677605', bank_ifsc: 'IDFB0021218',
    },
    'EL065': { // Thakur Parshad
        contact_number: '9050713481', bank_name: 'IDFC FIRST Bank (India)', bank_branch: 'CHANDIGARH', bank_account_number: '10087219846', bank_ifsc: 'IDFB0021373',
    },
    'EL006': { joining_date: '2026-02-01' }, // Uditanshu Chandel -- Basic Details only, no bank/contact given
};

(async () => {
    const ids = Object.keys(UPDATES);
    const { data: rows, error } = await sb.from('employees').select('id, employee_id, name').in('employee_id', ids);
    if (error) throw error;
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${rows.length} of ${ids.length} employees found`);
    for (const r of rows) {
        const patch = UPDATES[r.employee_id];
        console.log(`  ${r.employee_id} ${r.name}: ` + Object.entries(patch).map(([k, v]) => `${k}="${v}"`).join(', '));
        if (!APPLY) continue;
        const { error: uErr } = await sb.from('employees').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', r.id);
        console.log(`    ${uErr ? 'FAILED ' + uErr.message : 'ok'}`);
    }
    for (const id of ids) if (!rows.find(r => r.employee_id === id)) console.log(`  ${id}: not found, skipped`);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
