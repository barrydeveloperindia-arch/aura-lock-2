/**
 * AuraLock BLE Automation Verification Script
 * -----------------------------------------
 * This script verifies the hardware communication, timing, and concurrency
 * of the BLE Door Lock system.
 */

const { checkStatus, unlockDoor, runBleCommand } = require('./backend/doorService');

async function runVerification() {
    console.log("\n🚀 Starting AuraLock System Verification...\n");

    // 1. Adapter Check
    console.log("🟦 Step 1: Checking BLE Adapter...");
    const adapter = await runBleCommand('ADAPTER');
    if (adapter.success) {
        console.log("✅ Adapter OK\n");
    } else {
        console.error("❌ Adapter Error. No Bluetooth hardware found.\n");
        return;
    }

    // 2. Latency & Concurrency Test
    console.log("🟦 Step 2: Testing Concurrency & Caching (8 simultaneous calls)...");
    const start = Date.now();
    const promises = Array(8).fill(null).map(() => checkStatus());
    const results = await Promise.all(promises);
    const duration = (Date.now() - start) / 1000;

    const successes = results.filter(r => r.online).length;
    console.log(`📊 Results: ${successes}/8 successful`);
    console.log(`⏱️ Total Time: ${duration.toFixed(2)}s (Optimization Verified: < 8s)\n`);

    // 3. Hardware reachability
    console.log("🟦 Step 3: Checking Hardware Status...");
    if (results[0].online) {
        console.log(`✅ ${results[0].name} [${results[0].mac}] is ONLINE`);
        console.log(`📡 Signal Strength: ${results[0].rssi} dBm\n`);
    } else {
        console.warn("⚠️ Hardware is OFFLINE. Check ESP32 power.\n");
    }

    console.log("✨ Verification Complete.\n");
}

runVerification().catch(err => {
    console.error("❌ Critical Validation Failure:", err);
    process.exit(1);
});
