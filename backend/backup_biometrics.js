const supabase = require('./supabase');
const fs = require('fs');
const path = require('path');

async function backup() {
    console.log("📥 Starting Biometric Backup...");
    
    // 1. Fetch all face encodings
    const { data: encodings, error: encError } = await supabase
        .from('face_encodings')
        .select('*');

    if (encError) {
        console.error("❌ Error fetching encodings:", encError.message);
        return;
    }

    // 2. Fetch all employees to match names
    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, employee_id, name');

    if (empError) {
        console.error("❌ Error fetching employees:", empError.message);
        return;
    }

    // 3. Create a unified backup object
    const backupData = {
        timestamp: new Date().toISOString(),
        total_employees: employees.length,
        total_biometrics: encodings.length,
        data: encodings.map(enc => {
            const emp = employees.find(e => e.employee_id === enc.employee_id);
            return {
                employee_id: enc.employee_id,
                name: emp ? emp.name : 'Unknown',
                embedding: JSON.parse(enc.embedding),
                created_at: enc.created_at
            };
        })
    };

    // 4. Save to file
    const backupPath = path.join(__dirname, 'face_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    
    console.log(`✅ Backup Successful! Saved to: ${backupPath}`);
    console.log(`📊 Backed up ${encodings.length} face templates.`);
}

backup();
