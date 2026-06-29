const axios = require('axios');

const API_BASE = 'https://auralock-backend-50851729985.asia-south1.run.app';
const ADMIN_EMAIL = 'admin@auralock.com';
const ADMIN_PASSWORD = '2565';

async function runTests() {
    console.log("🚀 Starting Admin Panel API Tests...");
    let token = '';

    try {
        // 1. Test Login
        console.log("\n🔑 [1/4] Testing Admin Login...");
        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        
        if (loginRes.data.token) {
            token = loginRes.data.token;
            console.log("✅ Login Successful! Token received.");
        } else {
            throw new Error("Login failed: No token received.");
        }

        const headers = { Authorization: `Bearer ${token}` };

        // 2. Test Access Logs
        console.log("\n📋 [2/4] Testing Access Logs Fetch...");
        const logsRes = await axios.get(`${API_BASE}/api/access-logs?limit=5`, { headers });
        console.log(`✅ Access Logs Received: ${logsRes.data.logs?.length || 0} entries found.`);

        // 3. Test Attendance
        console.log("\n📅 [3/4] Testing Attendance Records Fetch...");
        const attRes = await axios.get(`${API_BASE}/api/attendance`, { headers });
        console.log(`✅ Attendance Data Received: ${attRes.data.length || 0} records found.`);

        // 4. Test User Management (Users List)
        console.log("\n👥 [4/4] Testing User Management (Employee List)...");
        const usersRes = await axios.get(`${API_BASE}/api/users`, { headers });
        console.log(`✅ Users List Received: ${usersRes.data.length || 0} employees found.`);

        console.log("\n✨ ALL ADMIN API TESTS PASSED SUCCESSFULLY! ✨");
        console.log("The Admin Panel should now be working perfectly for you.");

    } catch (error) {
        console.error("\n❌ TEST FAILED!");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data:`, JSON.stringify(error.response.data));
        } else {
            console.error(`Message: ${error.message}`);
        }
    }
}

runTests();
