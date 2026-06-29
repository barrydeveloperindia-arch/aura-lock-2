const supabase = require('../../supabase');

async function testLifecycle() {
    const testId = 'EMP-LIFECYCLE-1';
    
    console.log(`🚀 Starting Lifecycle Test for ${testId}...`);

    // 1. ADD
    console.log("➕ Phase 1: Adding employee...");
    const { data: addData, error: addError } = await supabase
        .from('employees')
        .insert([{
            employee_id: testId,
            name: 'Lifecycle Tester',
            email: 'lifecycle@test.com',
            role: 'employee',
            department: 'QA',
            status: 'Active'
        }])
        .select();

    if (addError) {
        console.error("❌ Add Failed:", addError.message);
        return;
    }
    console.log("✅ Add Successful.");

    // 2. DELETE
    console.log("➖ Phase 2: Deleting employee...");
    const { error: delError } = await supabase
        .from('employees')
        .delete()
        .eq('employee_id', testId);

    if (delError) {
        console.error("❌ Delete Failed:", delError.message);
    } else {
        console.log("✅ Delete Successful.");
    }

    console.log("🏁 Lifecycle Test Completed!");
}

testLifecycle();
