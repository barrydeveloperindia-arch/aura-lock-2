const supabase = require('./supabase');

async function check() {
    console.log("🔍 Checking for employee EMP-19...");
    const { data, error } = await supabase
        .from('employees')
        .select('id, employee_id, name')
        .eq('employee_id', 'EMP-19');

    if (error) {
        console.error("❌ Error fetching employee:", error.message);
    } else {
        console.log("✅ Results:", JSON.stringify(data, null, 2));
    }
}

check();
