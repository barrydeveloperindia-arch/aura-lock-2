const axios = require('axios');

async function checkBiometricHealth() {
    console.log("🚀 Checking Biometric API health (http://localhost:8001/health)...");
    try {
        const response = await axios.get('http://localhost:8001/health', { timeout: 5000 });
        console.log("✅ Success! Status:", response.status);
        console.log("Data:", JSON.stringify(response.data, null, 2));
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

checkBiometricHealth();
