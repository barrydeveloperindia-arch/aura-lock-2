const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testInsert() {
    console.log("🧪 Testing Insert into 'employees'...");

    const testUser = {
        employee_id: 'DIAG-TEST-' + Date.now(),
        name: 'Diagnosis Test User',
        email: 'diag@test.com',
        role: 'employee'
    };

    const { data, error } = await supabase.from('employees').insert(testUser).select();

    if (error) {
        console.error("❌ Insert Failed:", error.message);
        if (error.code === 'PGRST116') {
            console.log("💡 The table might exist but RLS is blocking access or some columns are missing.");
        }
    } else {
        console.log("✅ Insert Successful! Data:", data);

        // Cleanup
        await supabase.from('employees').delete().eq('employee_id', testUser.employee_id);
        console.log("🗑️ Cleanup Successful.");
    }
}

testInsert();
