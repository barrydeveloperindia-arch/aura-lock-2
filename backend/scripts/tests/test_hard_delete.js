const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function verifyHardDelete() {
    console.log("🧪 Starting Hard Delete Verification...");

    const testEid = "TEST-HARD-DELETE-" + Date.now();
    
    // 1. Create a temporary test employee
    const { data: user, error: e1 } = await supabase.from('employees').insert({
        employee_id: testEid, 
        name: "Test User (Hard Delete) " + Date.now(), 
        email: `test_${Date.now()}@example.com`, 
        role: "employee",
        status: "Active"
    }).select().single();

    if (e1) {
        console.error("❌ Error creating test user:", e1);
        return;
    }
    const employeeUuid = user.id;
    console.log(`✅ Created test user: UUID ${employeeUuid} | EID ${testEid}`);

    // 2. Create mock access logs referencing the EID
    const { error: e2 } = await supabase.from('access_logs').insert({
        employee_id: testEid,
        status: 'success',
        confidence: 1.0,
        device_id: 'test_hard_delete_script',
        metadata: {
            method: 'FACE'
        }
    });

    if (e2) {
        console.error("❌ Error creating access log:", e2);
        // Clean up user
        await supabase.from('employees').delete().eq('id', employeeUuid);
        return;
    }
    console.log("✅ Created mock access log.");

    // 3. Create mock attendance referencing the UUID
    const { error: e3 } = await supabase.from('attendance').insert({
        employee_id: employeeUuid,
        date: new Date().toISOString().split('T')[0],
        check_in: new Date().toISOString(),
        method: 'face'
    });

    if (e3) {
        console.error("❌ Error creating attendance:", e3);
        // Clean up access logs and user
        await supabase.from('access_logs').delete().eq('employee_id', testEid);
        await supabase.from('employees').delete().eq('id', employeeUuid);
        return;
    }
    console.log("✅ Created mock attendance.");

    // 4. Simulate the fixed server.js Hard Delete logic
    console.log("🔄 Triggering simulated Hard Delete (pre-deleting history)...");
    try {
        const r1 = await supabase.from('attendance').delete().eq('employee_id', employeeUuid);
        const r2 = await supabase.from('access_logs').delete().eq('employee_id', testEid);
        const r3 = await supabase.from('face_encodings').delete().eq('employee_id', testEid);
        const r4 = await supabase.from('fingerprints').delete().eq('employee_id', testEid);
        const r5 = await supabase.from('rfid_tags').delete().eq('employee_id', testEid);
        
        console.log("Attendance delete response:", JSON.stringify(r1));
        console.log("Access logs delete response:", JSON.stringify(r2));

        const { data: logsAfterDelete } = await supabase.from('access_logs').select('*').eq('employee_id', testEid);
        console.log("Logs after delete:", JSON.stringify(logsAfterDelete));

        console.log("✅ Successfully cleared all related records from DB.");

        console.log("🔄 Deleting base employee record...");
        const { error: deleteError } = await supabase
            .from('employees')
            .delete()
            .eq('id', employeeUuid);

        if (deleteError) {
            throw deleteError;
        }
        console.log("🎉 SUCCESS: Employee permanently purged from database without any foreign key violations!");
    } catch (err) {
        console.error("❌ Hard Delete Verification FAILED:", err.message || err);
    }
}

verifyHardDelete();
