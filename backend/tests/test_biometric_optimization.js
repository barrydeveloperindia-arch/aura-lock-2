const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:8000';

// Mock engine responses for testing
// We don't actually call the python engine in this unit test, but we verify how server.js handles the logic.
// However, since server.js calls Port 8001, we'd need a mock server on 8001 or to mock the axios call in server.js.
// Since i cannot easily mock axios inside server.js without editing it, I'll create a simple mock biometric server.

const express = require('express');
const mockApp = express();
mockApp.use(express.json());

let mockMode = 'SUCCESS'; // SUCCESS, AMBIGUOUS, REJECT

mockApp.post('/api/biometrics/face/verify', (req, res) => {
    if (mockMode === 'SUCCESS') {
        res.json({
            success: true,
            employee_id: 'EMP-UNIT-TEST',
            confidence: 0.92
        });
    } else if (mockMode === 'AMBIGUOUS') {
        res.json({
            success: false,
            message: "Ambiguous Match: Multiple users similar.",
            error_code: "AMBIGUOUS_MATCH",
            id_hint: 'EMP-UNIT-TEST'
        });
    } else {
        res.json({
            success: false,
            message: "Access Denied: Unrecognized face.",
            error_code: "NOT_RECOGNIZED"
        });
    }
});

const MOCK_PORT = 8001;
const server = mockApp.listen(MOCK_PORT, async () => {
    console.log(`📡 Mock Biometric Engine running on port ${MOCK_PORT}`);

    try {
        console.log("🚀 Starting Biometric Optimization Verification...");

        // 1. Test Success Path
        console.log("\n🧪 Scenario 1: Clean Match (Expected: Success)");
        mockMode = 'SUCCESS';
        // Note: server.js requires a file upload. We'll use a dummy buffer.
        // In this environment, we'll just check if the logic in server.js reacts correctly to the mock engine.

        // Actually, to truly test server.js, we need to hit its /api/biometrics/face/verify endpoint.
        // This requires 'form-data'.
        const FormData = require('form-data');
        const fs = require('fs');

        const testVerify = async (label) => {
            const form = new FormData();
            form.append('file', Buffer.from('dummy image'), 'test.jpg');
            try {
                const res = await axios.post(`${API_URL}/api/biometrics/face/verify`, form, {
                    headers: form.getHeaders()
                });
                console.log(`✅ [${label}] Response:`, res.data);
            } catch (err) {
                console.log(`🔴 [${label}] Error:`, err.response?.data || err.message);
                return err.response;
            }
        };

        await testVerify("Clean Match");

        // 2. Test Ambiguity Path
        console.log("\n🧪 Scenario 2: Ambiguous Match (Expected: MFA_REQUIRED)");
        mockMode = 'AMBIGUOUS';
        const ambigRes = await testVerify("Ambiguous Match");
        if (ambigRes?.status === 403 && ambigRes?.data.error_code === 'MFA_REQUIRED') {
            console.log("✅ FAIL-SAFE PASS: Backend correctly requested Fingerprint fallback.");
        }

        // 3. Test Rejection Path
        console.log("\n🧪 Scenario 3: Unrecognized (Expected: 401)");
        mockMode = 'REJECT';
        const rejectRes = await testVerify("Unrecognized");
        if (rejectRes?.status === 401) {
            console.log("✅ SECURITY PASS: Backend correctly denied access.");
        }

    } catch (error) {
        console.error("❌ Test Loop Error:", error.message);
    } finally {
        server.close();
        console.log("\n🏁 Verification Complete.");
    }
});
