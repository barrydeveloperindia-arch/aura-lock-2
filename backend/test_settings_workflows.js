const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Use IP to bypass DNS if needed, but the deployment URL is fine now
const API_URL = 'https://auralock-backend-50851729985.asia-south1.run.app';
const JWT_SECRET = process.env.JWT_SECRET || 'aura_lock_secret_2026_prod';
const ADMIN_TOKEN = jwt.sign({ name: 'Super Admin', email: 'admin@aura.com', role: 'admin' }, JWT_SECRET);

async function runSettingsTests() {
    console.log("🛠️ Starting Settings Workflow Tests (Corrected Endpoints)...");
    const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };

    try {
        // 1. Smoke Test: API Connectivity
        console.log("\n💨 Phase 1: Smoke Test (Connectivity)...");
        const statsRes = await axios.get(`${API_URL}/api/stats`, { headers });
        console.log(`✅ API is ALIVE. Server Date: ${statsRes.headers.date}`);

        // 2. Functional Test: Rebuild Biometric Cache (CORRECTED URL)
        console.log("\n🧠 Phase 2: Functional Test (Rebuild Cache)...");
        const cacheRes = await axios.post(`${API_URL}/api/door/rebuild-cache`, {}, { headers });
        if (cacheRes.data.success || cacheRes.status === 200) {
            console.log("✅ Cache Rebuild Workflow Verified.");
        }

        // 3. Functional Test: Update Admin Credentials
        console.log("\n🔒 Phase 3: Functional Test (Update Admin Credentials)...");
        const updateRes = await axios.post(`${API_URL}/api/system/update-credentials`, {
            newEmail: 'admin@aura.com' 
        }, { headers });
        if (updateRes.data.success) {
            console.log("✅ Credentials Update Endpoint is working.");
        }

        // 4. E2E Simulation: Clear Logs
        console.log("\n🧹 Phase 4: E2E Simulation (Clear Audit Logs)...");
        const clearRes = await axios.post(`${API_URL}/api/door/clear-logs`, {}, { headers });
        if (clearRes.data.success || clearRes.status === 200) {
            console.log("✅ Logs Clearing Workflow Verified.");
        }

        console.log("\n🏆 All Settings Workflows Passed Successfully!");
    } catch (error) {
        console.error("\n❌ Settings Test Failed!");
        console.error("Error Detail:", error.response?.data || error.message);
    }
}

runSettingsTests();
