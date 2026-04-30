const express = require('express');
const router = express.Router();
const { unlockDoor, lockDoor, checkStatus, getDeviceInfo } = require('./doorService');

const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || "https://wdtizlzfsijikcejerwq.supabase.co";
const supabase = createClient(supabaseUrl, process.env.SUPABASE_KEY);

/**
 * @route POST /api/door/unlock
 * @desc Triggers the door unlock via ESP32 BLE
 */
router.post('/unlock', async (req, res) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] Admin/Remote Door Unlock request received`);
    try {
        const result = await unlockDoor();
        if (result.success) {
            console.log('✅ Door unlock successful');

            // Log the remote unlock event
            try {
                await supabase.from('access_logs').insert({
                    employee_id: null,
                    status: 'success',
                    device_id: 'admin_panel',
                    method: 'REMOTE',
                    metadata: { 
                        operator: req.user?.email || 'admin',
                        unlock_source: 'ADMIN_PANEL'
                    }
                });
            } catch (logError) {
                console.error("⚠️ Failed to record remote unlock log:", logError.message);
            }

            return res.json({ success: true, message: result.message, timestamp: new Date().toISOString() });
        } else {
            console.error(`❌ Door unlock failed: ${result.message}`);
            // Return 400 instead of 500 for hardware failures to distinguish from server crashes
            return res.status(400).json({ success: false, message: result.message, timestamp: new Date().toISOString() });
        }
    } catch (error) {
        console.error(`❌ Critical Door Route Error:`, error.message);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

/**
 * @route POST /api/door/lock
 * @desc Triggers the door lock via ESP32 BLE
 */
router.post('/lock', async (req, res) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] Admin/Remote Door Lock request received`);
    try {
        const result = await lockDoor();
        if (result.success) {
            return res.json({ success: true, message: result.message });
        } else {
            return res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

/**
 * @route GET /api/door/status
 * @desc Checks status via Biometric Engine
 */
router.get('/status', async (req, res) => {
    try {
        const result = await checkStatus();
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ online: false, message: 'Server error' });
    }
});

/**
 * @route POST /api/door/rebuild-cache
 * @desc Triggers biometric template refresh
 */
router.post('/rebuild-cache', async (req, res) => {
    try {
        const result = await rebuildCache();
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route POST /api/door/clear-logs
 * @desc Deletes all access logs
 */
router.post('/clear-logs', async (req, res) => {
    try {
        const result = await clearLogs();
        return res.json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route GET /api/door/device
 * @desc Returns ESP32 device configuration info
 */
router.get('/device', (req, res) => {
    return res.json(getDeviceInfo());
});

module.exports = router;
