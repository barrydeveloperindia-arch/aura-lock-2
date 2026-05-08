const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const calculateDistance = (v1, v2) => {
    const arr1 = Array.isArray(v1) ? v1 : (typeof v1 === 'string' ? JSON.parse(v1) : v1);
    const arr2 = Array.isArray(v2) ? v2 : (typeof v2 === 'string' ? JSON.parse(v2) : v2);

    if (!arr1 || !arr2 || !Array.isArray(arr1) || !Array.isArray(arr2)) return 999;
    return Math.sqrt(arr1.reduce((sum, val, i) => sum + Math.pow(val - (arr2[i] || 0), 2), 0));
};

async function auditIdentities() {
    console.log("🔍 Auditing Biometric Identities in Supabase...");

    const { data: employees, error } = await supabase
        .from('employees')
        .select('id, name, employee_id, face_embedding');

    if (error) {
        console.error("❌ Error fetching employees:", error);
        return;
    }

    console.log(`📊 Found ${employees.length} records.\n`);

    // 1. Check for Duplicate Names/IDs
    const names = {};
    const ids = {};

    employees.forEach(emp => {
        console.log(`👤 Record: "${emp.name}" | ID: ${emp.employee_id}`);
        const lowName = emp.name.toLowerCase();
        names[lowName] = (names[lowName] || 0) + 1;
        ids[emp.employee_id] = (ids[emp.employee_id] || 0) + 1;
    });

    console.log("--- Duplicate Checks ---");
    Object.entries(names).filter(([k, v]) => v > 1).forEach(([k, v]) => console.warn(`⚠️ Name Duplicate: "${k}" appears ${v} times.`));
    Object.entries(ids).filter(([k, v]) => v > 1).forEach(([k, v]) => console.error(`❌ ID Conflict: "${k}" appears ${v} times.`));

    // 2. Cross-Distance Conflict Check (Finding people who look too similar)
    console.log("\n--- Full Distance Matrix (Threshold Audit) ---");
    for (let i = 0; i < employees.length; i++) {
        for (let j = i + 1; j < employees.length; j++) {
            const emp1 = employees[i];
            const emp2 = employees[j];

            if (emp1.face_embedding && emp2.face_embedding) {
                const dist = calculateDistance(emp1.face_embedding, emp2.face_embedding);
                console.log(`📏 Dist: "${emp1.name}" (${emp1.employee_id}) ↔ "${emp2.name}" (${emp2.employee_id}): ${dist.toFixed(4)}`);
                if (dist < 0.40) {
                    console.error(`🚨 CONFLICT: These users look too similar!`);
                }
            }
        }
    }

    console.log("\n✅ Audit Complete.");
}

auditIdentities();
