const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function verifySchema() {
    console.log("🕵️ Verifying Database Schema V2...");

    // 1. Check Employees Table Status/Deleted columns
    console.log("Checking 'employees' table extension...");
    const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('employee_id, status, is_deleted, updated_at')
        .limit(1);

    if (empErr) {
        console.error("❌ Employee table check failed:", empErr.message);
    } else {
        console.log("✅ Employee table structural updates verified.");
    }

    // 2. Check Face Encodings Table
    console.log("Checking 'face_encodings' table...");
    const { data: face, error: faceErr } = await supabase
        .from('face_encodings')
        .select('id, employee_id, embedding')
        .limit(1);

    if (faceErr) {
        console.error("❌ Face Encodings table missing or inaccessible:", faceErr.message);
    } else {
        console.log("✅ Face Encodings table verified.");
    }

    // 3. Check Fingerprints Table
    console.log("Checking 'fingerprints' table...");
    const { data: fing, error: fingErr } = await supabase
        .from('fingerprints')
        .select('id, employee_id, finger_index')
        .limit(1);

    if (fingErr) {
        console.error("❌ Fingerprints table missing or inaccessible:", fingErr.message);
    } else {
        console.log("✅ Fingerprints table verified.");
    }

    // 4. Check RFID Tags Table
    console.log("Checking 'rfid_tags' table...");
    const { data: rfid, error: rfidErr } = await supabase
        .from('rfid_tags')
        .select('tag_id, employee_id')
        .limit(1);

    if (rfidErr) {
        console.error("❌ RFID Tags table missing or inaccessible:", rfidErr.message);
    } else {
        console.log("✅ RFID Tags table verified.");
    }

    console.log("\n🏁 Schema Verification Finished.");
}

verifySchema();
