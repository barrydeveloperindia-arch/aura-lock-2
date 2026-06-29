const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// CONFIG
const API_URL = 'https://auralock-backend-50851729985.asia-south1.run.app';
const EMP_ID = 'EMP-19'; // Karan
const JWT_SECRET = process.env.JWT_SECRET || 'aura_lock_secret_2026_prod';
const ADMIN_TOKEN = jwt.sign({ name: 'Super Admin', email: 'admin@aura.com', role: 'admin' }, JWT_SECRET);

async function testExports() {
    console.log(`🚀 Starting Custom Export Tests for ${EMP_ID}...`);

    const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };

    try {
        // 1. Test Excel Export
        console.log("📊 Phase 1: Testing Excel Export...");
        const excelRes = await axios.get(`${API_URL}/api/attendance/export/excel/${EMP_ID}`, {
            headers,
            responseType: 'arraybuffer'
        });
        if (excelRes.status === 200) {
            console.log("✅ Excel Export Successful (Buffer Received)");
        }

        // 2. Test PDF Export
        console.log("📄 Phase 2: Testing PDF Export...");
        const pdfRes = await axios.get(`${API_URL}/api/attendance/export/pdf/${EMP_ID}`, {
            headers,
            responseType: 'arraybuffer'
        });
        if (pdfRes.status === 200) {
            console.log("✅ PDF Export Successful (Buffer Received)");
        }

        console.log("🏁 All Export Tests Passed!");
    } catch (error) {
        console.error("❌ Export Test Failed:", error.response?.data || error.message);
    }
}

testExports();
