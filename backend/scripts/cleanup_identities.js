const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function cleanupDuplicates() {
    console.log("🧹 Cleaning up duplicate identity: EMP-705252 (Shiv kumar)...");

    // 1. Delete the redundant record
    const { error } = await supabase
        .from('employees')
        .delete()
        .eq('employee_id', 'EMP-705252');

    if (error) {
        console.error("❌ Cleanup failed:", error);
    } else {
        console.log("✅ Successfully removed duplicate record: EMP-705252");
    }

    // 2. Ensure remaining Shiv Kumar record exists
    const { data: remaining } = await supabase
        .from('employees')
        .select('name, employee_id')
        .eq('employee_id', 'EMP-864896')
        .single();

    if (remaining) {
        console.log(`👤 Primary Identity Preserved: ${remaining.name} (${remaining.employee_id})`);
    } else {
        console.warn("⚠️ Warning: Primary identity EMP-864896 not found! May need re-registration.");
    }
}

cleanupDuplicates();
