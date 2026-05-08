const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testRegistration() {
    console.log("🧪 Testing Face Registration Flow...");

    // 1. Create Mock Image
    const mockImage = Buffer.from('mock-image-data');

    // 2. Prepare FormData
    const form = new FormData();
    form.append('file', mockImage, {
        filename: 'test.jpg',
        contentType: 'image/jpeg'
    });
    form.append('employeeId', 'TEST-123456');
    form.append('email', 'test@example.com');
    form.append('name', 'Test User');

    try {
        console.log("📡 Sending request to http://localhost:8000/api/biometrics/face/register...");
        const response = await axios.post('http://localhost:8000/api/biometrics/face/register', form, {
            headers: {
                ...form.getHeaders()
            }
        });

        console.log("✅ Response:", JSON.stringify(response.data, null, 2));

        if (response.data.success) {
            console.log("✨ TEST PASSED: registration successful in mock mode!");
        } else {
            console.log("❌ TEST FAILED:", response.data.message);
        }
    } catch (error) {
        console.error("❌ Request Error:", error.response?.data || error.message);
    }
}

testRegistration();
