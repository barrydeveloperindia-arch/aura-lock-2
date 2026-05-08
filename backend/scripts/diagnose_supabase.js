const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

async function diagnose() {
    console.log("🔍 [DIAGNOSIS] Starting Supabase Infrastructure Check...");
    console.log(`📡 URL: ${supabaseUrl}`);

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ ERROR: Missing credentials in .env");
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // 1. Check Connection & Identity
        console.log("\n--- 🔑 Auth Check ---");
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        // For service_role key, this might not return a user, but shouldn't fail with 401
        console.log("Auth Ping:", authError ? `Error: ${authError.message}` : "Successful Ping");

        // 2. Check Table Existence
        console.log("\n--- 📊 Table Check ---");
        const tables = ['employees', 'face_encodings', 'fingerprints', 'rfid_tags', 'security_alerts'];
        for (const table of tables) {
            const { error } = await supabase.from(table).select('count', { head: true, count: 'exact' });
            if (error) {
                console.log(`❌ Table '${table}': NOT FOUND or ACCESS DENIED (${error.message})`);
            } else {
                console.log(`✅ Table '${table}': EXISTS`);
            }
        }

        // 3. Test Delete Permission (Dry run on non-existent record)
        console.log("\n--- 🗑️ Delete Check ---");
        const { error: deleteError } = await supabase.from('employees').delete().eq('employee_id', 'NON_EXISTENT_DIAGNOSTIC_ID');
        if (deleteError) {
            console.log("❌ Delete Failed:", deleteError.message);
            if (deleteError.message.includes('permission denied')) {
                console.log("💡 Detected: You are likely using an 'anon' key with RLS enabled and no DELETE policy.");
            }
        } else {
            console.log("✅ Delete Permission: VERIFIED (Service Role bypass working)");
        }

    } catch (err) {
        console.error("💥 Diagnostic Script Crashed:", err.message);
    }
}

diagnose();
