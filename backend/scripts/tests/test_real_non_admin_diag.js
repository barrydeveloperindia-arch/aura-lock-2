const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'd:/SMART DOOR LOCK/backend/.env' });
const axios = require('axios');

const payload = { email: 'shiv.kumar.emp-961231@internal.com', role: 'employee' };
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

async function testRealNonAdminAuth() {
    console.log("🚀 Testing GET /api/stats with REAL non-admin token...");
    try {
        const response = await axios.get('http://localhost:8000/api/stats', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log("✅ Success! Status:", response.status);
    } catch (err) {
        console.error("❌ Failed!");
        if (err.response) {
            console.error("Status:", err.response.status);
            console.error("Data:", JSON.stringify(err.response.data, null, 2));
        } else {
            console.error("Message:", err.message);
        }
    }
}

testRealNonAdminAuth();
