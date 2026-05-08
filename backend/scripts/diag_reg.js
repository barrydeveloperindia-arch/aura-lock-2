const jwt = require('jsonwebtoken');
require('dotenv').config({ path: './.env' });

const payload = { email: '5089shivkumar@gmail.com', role: 'admin' };
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

const employeeData = {
    employeeId: "DIAG-TEST-" + Date.now(),
    name: "Diag Test",
    email: "diag@test.com",
    role: "employee",
    faceEncoding: Array.from({ length: 128 }, () => 0.1),
    image_url: "https://example.com/test.jpg"
};

async function testApi() {
    console.log("🚀 Testing /api/users endpoint with token...");
    try {
        const response = await fetch('http://localhost:8000/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(employeeData)
        });

        const result = await response.json();
        console.log("Status:", response.status);
        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("Fetch Error:", err.message);
    }
}

testApi();
