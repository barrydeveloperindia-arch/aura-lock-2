const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkConstraint() {
    console.log("🔍 Checking for UNIQUE constraint on 'employee_id'...");

    // Try to insert a duplicate employee_id
    const testId = 'STRESS-TEST-' + Date.now();
    const data = { employee_id: testId, name: 'Test 1', role: 'employee', email: 't1@test.com' };

    await supabase.from('employees').insert(data);

    // Attempt second insert with SAME employee_id
    const { error } = await supabase.from('employees').insert(data);

    if (error && error.code === '23505') {
        console.log("✅ UNIQUE constraint detected (Error 23505: duplicate key).");
    } else if (error) {
        console.log("❌ Unexpected error:", error.message);
    } else {
        console.warn("⚠️ NO UNIQUE CONSTRAINT! Both rows inserted successfully.");
        console.log("💡 This will cause 'upsert' to fail. You MUST run the SQL schema again.");
    }

    // Cleanup
    await supabase.from('employees').delete().eq('employee_id', testId);
}

checkConstraint();
