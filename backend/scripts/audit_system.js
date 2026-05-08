const supabase = require('./supabase');

async function auditSystem() {
    console.log("📊 Starting System Data Audit...");
    
    // 1. Check Employees count
    const { data: employees, count: empCount } = await supabase
        .from('employees')
        .select('*', { count: 'exact' });

    // 2. Check Face Encodings count
    const { data: encodings, count: encCount } = await supabase
        .from('face_encodings')
        .select('*', { count: 'exact' });

    // 3. Check for mismatches
    const missingEncodings = employees.filter(emp => 
        !encodings.some(enc => enc.employee_id === emp.employee_id)
    );

    console.log("-----------------------------------------");
    console.log(`✅ Total Employees in DB: ${empCount}`);
    console.log(`✅ Total Face Templates in DB: ${encCount}`);
    console.log("-----------------------------------------");

    if (missingEncodings.length > 0) {
        console.warn(`⚠️ Warning: ${missingEncodings.length} employees are missing face data!`);
        missingEncodings.forEach(e => console.log(`   - ${e.name} (${e.employee_id})`));
    } else {
        console.log("💎 Data Integrity: 100% (All employees have registered faces)");
    }

    // 4. Check API Latency
    const start = Date.now();
    await supabase.from('access_logs').select('id').limit(1);
    console.log(`⚡ API Response Time: ${Date.now() - start}ms`);
    console.log("-----------------------------------------");
}

auditSystem();
