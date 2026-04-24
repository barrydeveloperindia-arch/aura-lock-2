const axios = require('axios');
require('dotenv').config();

const API_URL = 'http://localhost:8000';
const ADMIN_LOGIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD };

async function verifyFix() {
    console.log("🚀 Starting Infrastructure Sync Verification...");

    try {
        // 1. Login to get token
        console.log("🔑 Authenticating...");
        const loginRes = await axios.post(`${API_URL}/auth/login`, ADMIN_LOGIN);
        const token = loginRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` } };

        // 2. Create Test User
        const testUser = {
            employeeId: "SYNC-TEST-999",
            name: "Initial Name",
            email: "sync@example.com",
            role: "employee",
            rfid: "RFID-SYNC-999"
        };
        console.log("👤 Creating test user...");
        const createRes = await axios.post(`${API_URL}/api/users`, testUser, config);
        const userId = createRes.data.id;
        console.log(`✅ User created with UUID: ${userId}`);

        // 3. Test Name Update (Fixes previous bug)
        console.log("✏️ Testing name update...");
        const updateRes = await axios.patch(`${API_URL}/api/users/${userId}`, { name: "Updated Name" }, config);
        if (updateRes.data.name === "Updated Name") {
            console.log("✅ PASS: Name update persisted successfully.");
        } else {
            console.error("❌ FAIL: Name update did not persist.");
        }

        // 4. Test Hard Delete
        console.log("🗑️ Testing hard-delete...");
        const deleteRes = await axios.delete(`${API_URL}/api/users/${userId}`, config);
        console.log("✅ Delete command sent:", deleteRes.data.message);

        // 5. Final Verification in Supabase (via script)
        console.log("🔍 Verifying removal from Supabase...");
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const { data: emp } = await supabase.from('employees').select('id').eq('id', userId).single();
        const { data: rfid } = await supabase.from('rfid_tags').select('tag_id').eq('employee_id', "SYNC-TEST-999").single();

        if (!emp && !rfid) {
            console.log("✅ PASS: User and RFID were permanently removed (CASCADE WORKING).");
        } else {
            console.error("❌ FAIL: Records still exist in Supabase!");
        }

    } catch (err) {
        console.error("💥 Sync Test Failed:", err.response?.data || err.message);
    }
}

verifyFix();
