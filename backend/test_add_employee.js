const supabase = require('./supabase');

async function testAddEmployee() {
    console.log("🧪 Adding Test Employee: EMP-TEST-99...");
    
    const { data, error } = await supabase
        .from('employees')
        .insert([{
            employee_id: 'EMP-TEST-99',
            name: 'Test Engineer',
            email: 'test.engineer@auralock.com',
            department: 'Quality Assurance',
            role: 'employee',
            status: 'Active'
        }])
        .select();

    if (error) {
        console.error("❌ Error adding employee:", error.message);
    } else {
        console.log("✅ Successfully added:", data[0].name, `(${data[0].employee_id})`);
        console.log("📊 Now run 'node audit_system.js' to see the updated count!");
    }
}

testAddEmployee();
