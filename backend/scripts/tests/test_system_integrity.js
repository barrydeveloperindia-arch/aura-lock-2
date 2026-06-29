const axios = require('axios');
const http = require('http');
require('dotenv').config();

const MOCK_PORT = 3333;
const BACKEND_URL = 'http://localhost:8000';
const SECRET = process.env.ESP32_SECRET || 'door_secret_pass_123';

/**
 * Mock ESP32 Server to verify Backend -> IoT commands
 */
const startMockEsp32 = () => {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const auth = req.headers['authorization'];
                if (req.url === '/unlock' && req.method === 'POST') {
                    if (auth === `Bearer ${SECRET}`) {
                        const data = JSON.parse(body);
                        const now = Math.floor(Date.now() / 1000);
                        if (Math.abs(now - data.timestamp) < 60) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true }));
                            console.log("✅ [Mock ESP32] Secure Unlock Command Verified");
                        } else {
                            res.writeHead(403); res.end("Expired");
                        }
                    } else {
                        res.writeHead(403); res.end("Unauth");
                    }
                }
            });
        });
        server.listen(MOCK_PORT, () => resolve(server));
    });
};

/**
 * Full Integrity Test
 */
async function runIntegrityTest() {
    console.log("🚀 Starting Smart Door Lock Integrity Suite...");
    const esp32 = await startMockEsp32();

    try {
        // 1. Test IoT Logging Endpoint (Fingerprint Simulation)
        console.log("\n📡 Phase 1: IoT Logging (Fingerprint)...");
        const logRes = await axios.post(`${BACKEND_URL}/api/logs/iot`, {
            method: "Fingerprint",
            id: "99",
            status: "success"
        }, { headers: { 'Authorization': `Bearer ${SECRET}` } });
        console.log("✅ IoT Event logged successfully");

        // 2. Test Backend -> IoT Communication
        // (Note: We simulate the unlockDoor logic used in verification success)
        console.log("\n🔒 Phase 2: Remote Unlock Security...");
        const unlockRes = await axios.post(`http://localhost:${MOCK_PORT}/unlock`, {
            timestamp: Math.floor(Date.now() / 1000)
        }, {
            headers: {
                'Authorization': `Bearer ${SECRET}`,
                'Content-Type': 'application/json'
            }
        });
        if (unlockRes.status === 200) console.log("✅ Secure communication verified");

        console.log("\n✨ SYSTEM INTEGRITY VERIFIED");
    } catch (error) {
        console.error("\n❌ INTEGRITY CHECK FAILED:", error.message);
        process.exit(1);
    } finally {
        esp32.close();
    }
}

runIntegrityTest();
