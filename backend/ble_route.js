const express = require('express');
const router = express.Router();
const {
    unlockDoor,
    checkStatus,
    getDeviceInfo,
    runBleCommand,
    lockDoor,
    connectBle,
    disconnectBle
} = require('./doorService');
const supabase = require('./supabase');

/**
 * @route GET /api/ble/scan
 * @desc Scans for nearby BLE devices
 */
router.get('/scan', async (req, res) => {
    try {
        console.log("🔍 Starting BLE scan...");
        const result = await runBleCommand('SCAN');
        if (result.success && result.devices) {
            return res.json({ success: true, devices: result.devices });
        }
        res.status(500).json({ success: false, message: result.message || 'Scan failed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route POST /api/ble/connect
 * @desc Manually connects to the configured BLE device
 */
router.post('/connect', async (req, res) => {
    const result = await connectBle();
    res.json(result);
});

/**
 * @route POST /api/ble/disconnect
 * @desc Manually disconnects from the BLE device
 */
router.post('/disconnect', async (req, res) => {
    const result = await disconnectBle();
    res.json(result);
});

/**
 * @route GET /api/ble/status
 * @desc Checks current BLE connection status
 */
router.get('/status', async (req, res) => {
    const status = await checkStatus();
    res.json(status);
});

/**
 * @route POST /api/door/lock
 * @desc Manually locks the door
 */
router.post('/lock', async (req, res) => {
    try {
        const result = await lockDoor();
        if (result.success) {
            await supabase.from('access_logs').insert({
                employee_id: req.user?.id || 'admin_remote',
                status: 'success',
                device_id: 'admin_panel',
                method: 'remote_lock',
                metadata: { action: 'manual_lock' }
            });
            return res.json(result);
        }
        res.status(500).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route POST /api/door/test
 * @desc Runs hardware diagnostic test
 */
router.post('/test', async (req, res) => {
    try {
        console.log("🧪 Starting hardware diagnostic test...");
        const unlock = await unlockDoor();
        if (!unlock.success) throw new Error(`Unlock test failed: ${unlock.message}`);

        // Wait 3s then lock
        setTimeout(async () => {
            await lockDoor();
            console.log("🧪 Diagnostic test completed.");
        }, 3000);

        res.json({ success: true, message: 'Diagnostic sequence started.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
