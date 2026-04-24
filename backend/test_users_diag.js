const jwt = require('jsonwebtoken');
require('dotenv').config({ path: 'd:/SMART DOOR LOCK/backend/.env' });
const axios = require('axios');

const payload = { email: '5089shivkumar@gmail.com', role: 'admin' };
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

async function testGetUsers() {
    console.log("🚀 Testing GET /api/users...");
    try {
        const response = await axios.get('http://localhost:8000/api/users', {
            headers: {
                'Authorization': `Bearer ${token}`
            },
            timeout: 5000
        });
        console.log("✅ Success! Status:", response.status);
        console.log("Data size:", Array.isArray(response.data) ? response.data.length : 'Not an array');
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

testGetUsers();
