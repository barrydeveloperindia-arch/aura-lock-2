const axios = require('axios');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Use IP directly to bypass DNS issues in node
const API_URL = 'https://34.143.76.2'; 
const EMP_ID = 'EMP-19'; 
const JWT_SECRET = process.env.JWT_SECRET || 'aura_lock_secret_2026_prod';
const ADMIN_TOKEN = jwt.sign({ name: 'Super Admin', email: 'admin@aura.com', role: 'admin' }, JWT_SECRET);

async function testAccessExport() {
    console.log(`🚀 Starting Access Log PDF Export Test for ${EMP_ID} (via IP)...`);

    const headers = { 
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        Host: 'auralock-backend-50851729985.asia-south1.run.app' // Required for Cloud Run SNI
    };

    try {
        // 1. Check Access Logs fetch
        console.log("🔍 Phase 1: Checking Access Logs data...");
        const logsRes = await axios.get(`${API_URL}/api/access-logs?employee_id=${EMP_ID}`, { 
            headers,
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // Allow IP-based HTTPS
        });
        if (logsRes.status === 200) {
            console.log(`✅ Access Logs fetched successfully (${logsRes.data.data?.length || 0} entries found)`);
        }

        // 2. Test Access Log PDF Export
        console.log("📄 Phase 2: Testing Access Log PDF Export...");
        const pdfRes = await axios.get(`${API_URL}/api/access-logs/export/pdf/${EMP_ID}`, {
            headers,
            responseType: 'arraybuffer',
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });
        if (pdfRes.status === 200) {
            console.log("✅ Access Log PDF Export Successful (Buffer Received)");
        }

        console.log("🏁 Access Export Test Completed!");
    } catch (error) {
        console.error("❌ Access Export Test Failed:", error.response?.data || error.message);
    }
}

testAccessExport();
