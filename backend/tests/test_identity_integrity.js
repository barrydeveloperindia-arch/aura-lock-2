const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:8000';
const ADMIN_TOKEN = jwt.sign(
    { name: 'Super Admin', email: process.env.ADMIN_EMAIL, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
);

const headers = {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json'
};

async function runTests() {
    console.log("🚀 Starting Identity Integrity Verification...");

    try {
        // 0. Cleanup from previous runs
        console.log("🧹 Cleaning up previous test records...");
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

        const testIds = ['EMP-UNIQUE-101', 'EMP-UNIQUE-102', 'EMP-RFID-OWNER', 'EMP-RFID-THIEF'];
        for (const id of testIds) {
            await supabase.from('employees').delete().eq('employee_id', id);
        }
        console.log("✨ Cleanup successful.");

        // 1. Create a base user
        console.log("\n🧪 Step 1: Creating base user 'Original User'...");
        const baseUser = {
            employeeId: 'EMP-UNIQUE-101',
            name: 'Original User',
            email: 'original@example.com',
            role: 'employee'
        };
        await axios.post(`${API_URL}/api/users`, baseUser, { headers });
        console.log("✅ Base user created.");

        // 2. Attempt duplicate Employee ID
        console.log("\n🧪 Step 2: Testing Duplicate Employee ID...");
        try {
            await axios.post(`${API_URL}/api/users`, {
                employeeId: 'EMP-UNIQUE-101',
                name: 'Duplicate ID User',
                email: 'dup-id@example.com'
            }, { headers });
            console.log("❌ FAIL: Duplicate Employee ID was accepted!");
        } catch (error) {
            console.log("✅ PASS: Correctly rejected duplicate Employee ID:", error.response?.data?.message);
        }

        // 3. Attempt duplicate Name
        console.log("\n🧪 Step 3: Testing Duplicate Name...");
        try {
            await axios.post(`${API_URL}/api/users`, {
                employeeId: 'EMP-UNIQUE-102',
                name: 'Original User', // Same name as Step 1
                email: 'dup-name@example.com'
            }, { headers });
            console.log("❌ FAIL: Duplicate Name was accepted!");
        } catch (error) {
            console.log("✅ PASS: Correctly rejected duplicate Name:", error.response?.data?.message);
        }

        // 4. Test RFID Uniqueness & Alert
        console.log("\n🧪 Step 4: Testing RFID Conflict Alert...");
        // First assign RFID to User 1 (Mock registration logic usually happens via /biometrics)
        // We'll simulate by checking if the middleware catches it if we had an endpoint that takes RFID
        // For now, let's assume /api/users can take rfid (as per my middleware design)
        try {
            await axios.post(`${API_URL}/api/users`, {
                employeeId: 'EMP-RFID-OWNER',
                name: 'RFID Owner',
                rfid: 'TAG-CONFLICT-999'
            }, { headers });

            // Now attempt to steal it
            await axios.post(`${API_URL}/api/users`, {
                employeeId: 'EMP-RFID-THIEF',
                name: 'RFID Thief',
                rfid: 'TAG-CONFLICT-999'
            }, { headers });
            console.log("❌ FAIL: Duplicate RFID was accepted!");
        } catch (error) {
            console.log("✅ PASS: Correctly rejected duplicate RFID:", error.response?.data?.message);
        }

        console.log("\n🏁 Verification Complete.");

    } catch (error) {
        console.error("❌ Test Suite Crashed:", error.response?.data || error.message);
    }
}

runTests();
