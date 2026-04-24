const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testVerification() {
    console.log("🧪 Simulating Face Verification Request...");

    // 1. Fetch from Supabase directly to see who we should expect
    const { data: employees } = await supabase.from('employees').select('name, employee_id').order('created_at', { ascending: false });

    if (!employees || employees.length === 0) {
        console.error("❌ Test Failed: No employees in database. Please register one first.");
        return;
    }

    console.log(`📡 Registered User Found: ${employees[0].name} (${employees[0].employee_id})`);

    // 2. Hit the API endpoint using native fetch (Node 20+)
    const formData = new FormData();
    const dummyBlob = new Blob(['dummy-image-data'], { type: 'image/jpeg' });
    formData.append('file', dummyBlob, 'test.jpg');

    try {
        const response = await fetch('http://localhost:8000/api/biometrics/face/verify', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        console.log("✅ API Response:", JSON.stringify(result, null, 2));

        if (result.success && result.user.name === employees[0].name) {
            console.log("\n✨ TEST PASSED: Face recognition simulation granted access to the correct user!");
        } else {
            console.log("\n❌ TEST FAILED: Response did not match expected user.");
        }
    } catch (error) {
        console.error("❌ API Request Failed:", error.message);
    }
}

testVerification();
