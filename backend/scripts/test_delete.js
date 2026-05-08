require('dotenv').config({ path: 'c:/Users/Englabs/.gemini/antigravity/scratch/smart-door-lock/backend/.env' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || "https://wdtizlzfsijikcejerwq.supabase.co", process.env.SUPABASE_KEY);

async function verifySoftDelete() {
    console.log("🧪 Starting Soft Delete Verification...");

    // 1. Create a temporary test user
    const testEid = "TEST-SOFT-DELETE-" + Date.now();
    const { data: user, error: e1 } = await supabase.from('employees').insert({
        employee_id: testEid, 
        name: "Test User (Soft Delete)", 
        email: `test_${Date.now()}@example.com`, 
        status: "Active"
    }).select().single();

    if (e1) { console.error("❌ Error creating test user:", e1); return; }
    console.log("✅ Created test user:", user.id);

    // 2. Create mock attendance for this user
    const { error: e2 } = await supabase.from('attendance').insert({
        employee_id: user.id, 
        date: new Date().toISOString().split('T')[0], 
        check_in: new Date().toISOString(), 
        method: 'face'
    });

    if (e2) { console.error("❌ Error creating attendance:", e2); return; }
    console.log("✅ Created mock attendance record.");

    // 3. Simulate Soft Delete (Logic from server.js)
    console.log("🔄 Triggering Soft Delete...");
    const { data: updated, error: e3 } = await supabase
        .from('employees')
        .update({ status: 'Deleted', is_deleted: true })
        .eq('id', user.id)
        .select()
        .single();

    if (e3) {
        console.error("❌ Soft delete failed:", e3.message);
    } else {
        console.log("✅ Soft delete successful. Current Status:", updated.status);
    }

    // 4. VERIFY: Attendance should STILL exist
    const { data: att, error: e4 } = await supabase
        .from('attendance')
        .select('*')
        .eq('employee_id', user.id);

    if (att && att.length > 0) {
        console.log(`🎉 VERIFICATION SUCCESS: ${att.length} attendance records preserved for deleted user.`);
    } else {
        console.error("❌ VERIFICATION FAILED: Attendance records were lost!");
    }

    // Cleanup (optional: hard delete the test user and its attendance now)
    // await supabase.from('attendance').delete().eq('employee_id', user.id);
    // await supabase.from('employees').delete().eq('id', user.id);
}

verifySoftDelete();
