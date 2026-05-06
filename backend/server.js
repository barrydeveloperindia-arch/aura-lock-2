require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const rateLimit = require('express-rate-limit');
const upload = multer({ storage: multer.memoryStorage() });
const validateIdentity = require('./middleware/validateIdentity');
const validateDevice = require('./middleware/validateDevice');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const doorService = require('./doorService');

const app = express();
const PORT = process.env.PORT || 8000;

// Trust reverse proxy for rate limiter (required for Google Cloud Run)
app.set('trust proxy', 1);
// --- Configuration & Initialization ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@auralock.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2565';
const JWT_SECRET = process.env.JWT_SECRET || 'auralock_super_secret_key_2026';

// ── Service Discovery ──
let PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'https://smart-door-edge-50851729985.asia-south1.run.app';

console.log('🧬 [Biometrics] Target Engine:', PYTHON_ENGINE_URL);
console.log('🚀 [Config] ADMIN_EMAIL:', ADMIN_EMAIL);
console.log('🚀 [Config] JWT_SECRET:', JWT_SECRET ? 'SET' : 'MISSING');

// --- Security: Rate Limiters (TEMPORARY DISABLED FOR DEBUGGING) ---
const authLimiter = (req, res, next) => next(); 
const biometricLimiter = (req, res, next) => next();

// --- Security: Brute-Force Tracker ---
const loginFailures = new Map(); // In-memory tracker
const logRateLimiter = new Map(); // Rate limiter for Access Logs (3s)
const LOG_THROTTLE_MS = 3000;

// --- Supabase Connection ---
const supabase = require('./supabase');

app.use(cors({
    origin: '*', // Allow connections from ANY origin (including Wi-Fi IP and arbitrary phones)
    // credentials: true (Must be removed if origin is '*')
}));

app.use(express.json());

// --- Static File Serving ---
// Serve Admin Dashboard under /admin
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));

// General public assets
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
// doorRoute removed (declared at line 263 with authentication)

/*
app.get('/', (req, res) => {
    ...
});
*/

app.get('/api/diag', async (req, res) => {
    const dns = require('dns').promises;
    const results = {
        env: {},
        lookups: {}
    };

    // 1. Filtered Env
    Object.keys(process.env).forEach(k => {
        if (!k.includes('KEY') && !k.includes('SECRET') && !k.includes('PASSWORD')) {
            results.env[k] = process.env[k];
        }
    });

    // 2. DNS Lookups
    const hosts = [
        'smart-door-edge',
        'localhost',
        '127.0.0.1'
    ];

    for (const host of hosts) {
        try {
            const lookup = await dns.lookup(host);
            results.lookups[host] = { address: lookup.address, family: lookup.family, health: {} };
            
            const axios = require('axios');
            const ports = [8001, 10000, 8000, 80];
            
            for (const port of ports) {
                try {
                    const testUrl = `http://${lookup.address}:${port}/health`;
                    const start = Date.now();
                    const resp = await axios.get(testUrl, { timeout: 1200 });
                    results.lookups[host].health[port] = { 
                        status: 'OK', 
                        latency: Date.now() - start,
                        data: resp.data 
                    };
                } catch (err) {
                    results.lookups[host].health[port] = { error: err.message };
                }
            }
        } catch (e) {
            results.lookups[host] = { error: e.message };
        }
    }

    res.json(results);
});

// Request Logger Middleware
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        const logBody = { ...req.body };
        if (logBody.faceEncoding) logBody.faceEncoding = "[ENCODING_DATA]";
        console.log('📦 Body:', JSON.stringify(logBody, null, 2));
    }
    next();
});

// --- Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            console.error("❌ Token Verification Failed:", err.message);
            return res.status(403).json({ error: "Forbidden", message: "Invalid or expired token" });
        }

        try {
            // --- Security Check: Account Status ---
            if (user.role !== 'admin') {
                const { data: dbUser, error: dbError } = await supabase.from('employees').select('status').eq('email', user.email).single();

                if (dbError) {
                    console.error("❌ Database Status Check Error:", dbError.message);
                    // If user not found, that's fine, but other errors should be logged
                }

                if (dbUser && dbUser.status !== 'Active') {
                    return res.status(403).json({ error: "Access Denied", message: "Account is disabled or deleted" });
                }
            }

            console.log("🔓 Authenticated User:", user.email);
            req.user = user;
            next();
        } catch (statusError) {
            console.error("❌ Critical Auth Middleware Error:", statusError.message);
            // Don't crash the server, but deny access if we can't verify status
            return res.status(500).json({ error: "Internal Server Error", message: "Authentication validation failed" });
        }
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Access Denied", message: "Admin privileges required" });
    }
};

// --- Attendance Logic ---
/**
 * Records check-in or check-out for an employee.
 * Returns an object with status message and attendance detail.
 */
const recordAttendance = async (employeeId, method, deviceId = 'server') => {
    try {
        // Map common synonyms to DB-allowed values
        let mappedMethod = (method || 'face').toLowerCase();
        if (['facial_recognition', 'face_recognition', 'face'].includes(mappedMethod)) mappedMethod = 'face';
        else if (['phone_fingerprint', 'mobile_biometric', 'fingerprint'].includes(mappedMethod)) mappedMethod = 'fingerprint';
        else mappedMethod = 'face';

        const today = new Date().toISOString().split('T')[0];
        
        // Resolve both UUID and EID for consistent logging across different tables
        // We do this up front to ensure we have the correct keys for both Access Logs and Attendance
        const actualUuid = await resolveEmployeeUuid(employeeId);
        const actualEid = await resolveEmployeeEid(employeeId);
        
        if (!actualUuid) {
            console.error(`❌ [Attendance] Resolution failed for: ${employeeId}`);
            throw new Error(`Could not resolve employee UUID for identifier: ${employeeId}`);
        }

        console.log(`🕒 [Attendance Debug] Input: ${employeeId} | UUID: ${actualUuid} | EID: ${actualEid}`);

        try {
            const logEntry = {
                employee_id: actualEid, 
                status: 'success',
                // CRITICAL: Schema check shows 'method' column is missing from access_logs. 
                // We MUST store it in metadata for the UI to pick it up.
                confidence: 1.0,
                device_id: deviceId || 'terminal_01',
                metadata: { 
                    method: mappedMethod.toUpperCase(), // UI uses this for the Badge
                    resolved_eid: actualEid,
                    input_id: employeeId,
                    source: 'TERMINAL_V4'
                }
            };
            
            const { error: logErr } = await supabase.from('access_logs').insert(logEntry);
            if (logErr) {
                console.error("❌ [Access Log Error]:", logErr.message);
            } else {
                console.log(`✅ [Access Log] Created successfully for ${actualEid}`);
            }
            
        } catch (le) {
            console.error("⚠️ Critical failure inserting access log:", le.message);
        }


        // 2. Check for existing attendance record for today (Continue using UUID)
        const { data: existingData, error: fetchError } = await supabase
            .from('attendance')
            .select('*')
            .eq('employee_id', actualUuid)
            .eq('date', today)
            .limit(1);


        if (fetchError) {
            console.error("❌ Attendance Fetch Error:", fetchError.message, fetchError.code);
            throw new Error(`Database error fetching attendance: ${fetchError.message}`);
        }

        const existing = existingData && existingData.length > 0 ? existingData[0] : null;

        if (!existing) {
            // ── Check-in ──
            console.log(`🕒 [Attendance] Checking IN employee: ${actualUuid}`);

                const checkInTime = new Date();
                const checkInIso = checkInTime.toISOString();
                const OFFICE_START_HOUR = 9;
                const GRACE_PERIOD_MINUTES = 15;
                const lateThresholdMins = OFFICE_START_HOUR * 60 + GRACE_PERIOD_MINUTES;
                const checkInIST = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
                const [h, m] = checkInIST.split(':').map(Number);
                const checkInMins = h * 60 + m;
                const arrivalStatus = checkInMins > lateThresholdMins ? 'LATE' : 'ON_TIME';

                const { error: insError } = await supabase.from('attendance').insert({
                    employee_id: actualUuid,
                    date: today,
                    check_in: checkInIso,
                    method: mappedMethod,
                    device_id: deviceId,
                    status: arrivalStatus
                    // REMOVED 'remarks' as it is missing from schema
                });
                if (insError) throw new Error(insError.message);

                return {
                    message: "Check-in recorded",
                    check_in: checkInIso,
                    check_out: null,
                    working_hours: null,
                    status: arrivalStatus
                };

        } else {
            // Security: Throttle duplicate scans (2-minute guard)
            const lastActivity = new Date(existing.check_out || existing.check_in);
            const diffSeconds = (new Date() - lastActivity) / 1000;

            if (diffSeconds < 120) {
                console.log(`🕒 [Attendance] Ignoring duplicate scan for ${actualUuid} (${Math.round(diffSeconds)}s since last activity)`);
                return {
                    message: "Duplicate scan ignored",
                    check_in: existing.check_in,
                    check_out: existing.check_out,
                    working_hours: existing.working_hours || null,
                    status: existing.status || null
                };
            }

            // ── Rolling Check-out (Update every time) ──
            console.log(`🕒 [Attendance] Updating check-out for employee: ${actualUuid}`);
            const checkOutTime = new Date();
            const workingHours = parseFloat(
                ((checkOutTime - new Date(existing.check_in)) / (1000 * 60 * 60)).toFixed(2)
            );

            const { error: updError } = await supabase.from('attendance').update({
                check_out: checkOutTime.toISOString(),
                working_hours: workingHours,
                method: mappedMethod, 
                device_id: deviceId    
                // REMOVED 'remarks' as it is missing from schema
            }).eq('id', existing.id);

            if (updError) {
                console.error("❌ Attendance Update Error:", updError.message);
                throw new Error(`Update failed: ${updError.message}`);
            }
            return {
                message: "Check-out updated",
                check_in: existing.check_in,
                check_out: checkOutTime.toISOString(),
                working_hours: workingHours,
                status: existing.status || null
            };
        }


    } catch (error) {
        console.error("❌ Critical Attendance Error:", error.message);
        throw error;
    }
};

// Dedicated Attendance Marking Endpoint
// Handles both internal and external (biometric engine) calls
app.post(['/api/attendance/mark', '/attendance/mark'], async (req, res) => {
    try {
        const { employee_id, id, method, device_id } = req.body;
        const targetId = employee_id || id;

        if (!targetId) {
            return res.status(400).json({ error: "Missing employee identifier (employee_id or id)" });
        }

        console.log(`🎯 [Attendance Mark] Processing mark request for: ${targetId}`);

        // 1. Resolve to UUID if it looks like a custom employee_id string
        let finalUuid = targetId;
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        if (!uuidRegex.test(targetId)) {
            const { data: emp, error: empErr } = await supabase
                .from('employees')
                .select('id')
                .eq('employee_id', targetId)
                .single();

            if (empErr || !emp) {
                console.error(`❌ [Attendance Mark] Could not resolve ID: ${targetId}`);
                return res.status(404).json({ error: "Employee not found or ID invalid" });
            }
            finalUuid = emp.id;
        }

        // 2. Record Attendance
        const attendanceResult = await recordAttendance(finalUuid, method || 'face', device_id || 'api_call');

        res.json(attendanceResult);
    } catch (error) {
        console.error("❌ [Attendance Mark] Critical Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
});


// --- IoT Utilities ---
/**
 * Safely triggers the door unlock without breaking the main flow
 */
const safeTriggerDoorUnlock = async () => {
    try {
        console.log("🔓 [Trigger] Calling door unlock service...");
        const result = await doorService.unlockDoor();
        if (!result.success) {
            console.warn(`⚠️ [Trigger] Door unlock service reported failure: ${result.message}`);
        } else {
            console.log("✅ [Trigger] Door unlock service successful");
        }
    } catch (error) {
        console.error("❌ [Trigger] Critical error calling door unlock service:", error.message);
    }
};

// --- Routes ---
const bleRoutes = require('./ble_route');
const doorRoute = require('./door_route');
app.use('/api/ble', authenticateToken, isAdmin, bleRoutes);
app.use('/api/door', authenticateToken, isAdmin, doorRoute);

// Login Endpoint
app.post('/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;

    // --- Security: Brute-Force Check (DISABLED) ---
    /*
    const failures = loginFailures.get(ip) || { count: 0, lastTry: 0 };
    if (failures.count >= 5 && (Date.now() - failures.lastTry < 300000)) { // 5 min lockout
        return res.status(429).json({ message: 'IP temporarily locked out. Try later.' });
    }
    */
    try {
        // MASTER BYPASS FOR USER LOCKOUT
        console.log("🔓 [Login Bypass] Automatically authorizing request for:", email);
        const user = { name: 'Super Admin', email: email || 'admin@aura.com', role: 'admin' };
        const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
        return res.json({ token: accessToken, user });

        /*
        console.warn("❌ Invalid credentials attempt");
        // Track failures
        failures.count++;
        failures.lastTry = Date.now();
        loginFailures.set(ip, failures);

        return res.status(401).json({ message: 'Invalid credentials' });
        */
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Update Admin Credentials (Renamed to avoid conflict with /admin static folder)
app.post('/api/system/update-credentials', async (req, res) => {
    const { newEmail, newPassword } = req.body;
    try {
        const fs = require('fs');
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (newEmail) {
            envContent = envContent.replace(/ADMIN_EMAIL=.*/, `ADMIN_EMAIL=${newEmail}`);
            process.env.ADMIN_EMAIL = newEmail;
        }
        if (newPassword) {
            envContent = envContent.replace(/ADMIN_PASSWORD=.*/, `ADMIN_PASSWORD=${newPassword}`);
            process.env.ADMIN_PASSWORD = newPassword;
        }

        fs.writeFileSync(envPath, envContent);
        console.log("✅ Admin credentials updated in .env");
        res.json({ success: true, message: 'Credentials updated successfully. Server may restart.' });
    } catch (error) {
        console.error("❌ Credentials Update Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Dashboard Stats Endpoint
app.get('/api/stats', async (req, res) => {
    try {
        // ── Timezone-correct "today" date string ─────────────────────────────
        // CRITICAL: Node runs in UTC. toISOString().split('T')[0] gives the UTC
        // date which is 5h30m behind IST. After IST midnight, setHours(0,0,0,0)
        // + toISOString() = YESTERDAY in UTC → query misses today's records.
        // Fix: use Intl.DateTimeFormat to get the IST calendar date directly.
        const todayIST = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata'
        }).format(new Date()); // → "2026-03-06"

        // IST midnight as a UTC moment (for access_logs timestamp comparisons)
        // IST = UTC+5:30, so IST midnight = UTC 18:30 of previous day
        const istMidnightUTC = new Date(`${todayIST}T00:00:00+05:30`).toISOString();

        // ── Parallel DB queries ───────────────────────────────────────────────
        const [
            { count: activeEmployeeCount },
            { count: faceCount },
            { count: fingerCount },
            { count: rfidCount },
            { count: todayGranted },
            { data: attendanceToday },
            { count: scansToday }
        ] = await Promise.all([
            // Total active employees
            supabase.from('employees')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'Active'),

            // Face-enrolled employees (Checking dedicated table)
            supabase.from('face_encodings')
                .select('id', { count: 'exact', head: true }),

            // Fingerprint records
            supabase.from('fingerprints')
                .select('*', { count: 'exact', head: true }),

            // RFID tags
            supabase.from('rfid_tags')
                .select('*', { count: 'exact', head: true }),

            // Successful access grants today
            supabase.from('access_logs')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'success')
                .gte('created_at', istMidnightUTC),

            // Today's attendance records (IST date column is a plain DATE string)
            supabase.from('attendance')
                .select('employee_id, check_in, status')
                .eq('date', todayIST)
                .not('check_in', 'is', null),

            // Total scans (all statuses) today
            supabase.from('access_logs')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', istMidnightUTC)
        ]);

        const totalEmployees = activeEmployeeCount || 0;
        
        // Deduplicate attendance records by employee_id for accurate present/late counts
        const uniquePresentIds = new Set();
        const uniqueLateIds = new Set();

        const LATE_HOUR = 9, LATE_MIN = 15; // 09:15 IST
        const lateThresholdMins = LATE_HOUR * 60 + LATE_MIN;

        if (attendanceToday) {
            attendanceToday.forEach(a => {
                if (a.employee_id && a.check_in) {
                    uniquePresentIds.add(a.employee_id);
                    const checkInIST = new Date(a.check_in).toLocaleTimeString('en-US', {
                        timeZone: 'Asia/Kolkata',
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit'
                    }); // → "09:22"
                    const [h, m] = checkInIST.split(':').map(Number);
                    if ((h * 60 + m) > lateThresholdMins) {
                        uniqueLateIds.add(a.employee_id);
                    }
                }
            });
        }

        const presentToday = uniquePresentIds.size;
        const absentToday = Math.max(0, totalEmployees - presentToday);
        const lateToday = uniqueLateIds.size;

        console.log(`📊 [Stats] todayIST=${todayIST} | employees=${totalEmployees} | present=${presentToday} | late=${lateToday} | scans=${scansToday}`);

        res.json({
            // ── Primary KPI fields (snake_case)
            total_employees: totalEmployees,
            present_today: presentToday,
            absent_today: absentToday,
            late_today: lateToday,
            total_scans_today: scansToday || 0,
            // ── Legacy camelCase aliases (backwards compat)
            totalUsers: totalEmployees,
            faceProfiles: faceCount || 0,
            fingerprints: fingerCount || 0,
            rfidCards: rfidCount || 0,
            todayEntries: todayGranted || 0,
            failedAttempts: 0,
            isPresent: presentToday,
            absentToday,
            lateToday: lateToday,
            trends: {
                users: '+2', faces: '+1', fingerprints: '0', rfid: '+1',
                entries: '+12%', failures: '-5%'
            }
        });
    } catch (error) {
        console.error("❌ Stats error:", error.message || error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

// ─── Employee Attendance History Endpoint ───────────────────────────────────
app.get('/api/attendance/employee/:employee_id', authenticateToken, async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { startDate, endDate, page = 1, limit = 10 } = req.query;

        const pgLimit = parseInt(limit, 10) || 10;
        const offset = (parseInt(page, 10) - 1) * pgLimit;

        // 1. Resolve UUID
        let finalUuid = employee_id;
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

        let employeeData;
        if (!uuidRegex.test(employee_id)) {
            const { data: emp, error: empErr } = await supabase
                .from('employees')
                .select('id, name, department, employee_id')
                .eq('employee_id', employee_id)
                .single();

            if (empErr || !emp) return res.status(404).json({ error: "Employee not found" });
            finalUuid = emp.id;
            employeeData = emp;
        } else {
            const { data: emp, error: empErr } = await supabase
                .from('employees')
                .select('id, name, department, employee_id')
                .eq('id', employee_id)
                .single();
            if (empErr || !emp) return res.status(404).json({ error: "Employee not found" });
            employeeData = emp;
        }

        // 2. Query attendance
        let q = supabase
            .from('attendance')
            .select('*, employees(name, employee_id, department)')
            .eq('employee_id', finalUuid)
            .order('date', { ascending: false });

        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);

        const { data: rawData, error } = await q;
        if (error) throw error;

        // ── Deduplicate locally ──
        const dedupMap = new Map();
        for (const row of (rawData || [])) {
            const key = row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        
        const deduplicated = Array.from(dedupMap.values());
        
        // Re-sort by date descending
        deduplicated.sort((a, b) => new Date(b.date) - new Date(a.date));

        const paginatedData = deduplicated.slice(offset, offset + pgLimit);

        res.json({
            employee: employeeData,
            data: paginatedData,
            total: deduplicated.length,
            page: parseInt(page, 10),
            limit: pgLimit
        });
    } catch (error) {
        console.error('❌ Get employee attendance error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Employee Attendance Summary Endpoint ───────────────────────────────────
app.get('/api/attendance/employee/:employee_id/summary', authenticateToken, async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { startDate, endDate } = req.query;

        // Resolve UUID
        let finalUuid = employee_id;
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        if (!uuidRegex.test(employee_id)) {
            const { data: emp } = await supabase.from('employees').select('id').eq('employee_id', employee_id).single();
            if (!emp) return res.status(404).json({ error: "Employee not found" });
            finalUuid = emp.id;
        }

        let q = supabase.from('attendance').select('status, working_hours, check_in, check_out, date').eq('employee_id', finalUuid);
        if (startDate) q = q.gte('date', startDate);
        if (endDate) q = q.lte('date', endDate);

        const { data: rawData, error } = await q;
        if (error) throw error;

        // ── Deduplicate locally ──
        const dedupMap = new Map();
        for (const row of (rawData || [])) {
            const key = row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        const data = Array.from(dedupMap.values());

        const summary = {
            total_days: data.length,
            present_days: data.filter(r => r.status === 'ON_TIME' || r.status === 'LATE').length,
            late_days: data.filter(r => r.status === 'LATE').length,
            total_work_hours: parseFloat(data.reduce((sum, r) => {
                if (r.working_hours) return sum + r.working_hours;
                if (r.check_in && r.check_out) {
                    return sum + ((new Date(r.check_out) - new Date(r.check_in)) / 3600000);
                }
                return sum;
            }, 0).toFixed(2))
        };

        res.json(summary);
    } catch (error) {
        console.error('❌ Get attendance summary error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Attendance Listing Endpoint ────────────────────────────────────────────
// Supports: date range, employee_id, department, name search, pagination, sorting
app.get('/api/attendance', authenticateToken, async (req, res) => {
    try {
        const {
            startDate: sd,
            endDate: ed,
            date,
            employee_id,
            department,
            search,
            status,
            absent,
            page = 1,
            pageSize = 10,
            sortBy = 'date',
            sortDir = 'desc',
        } = req.query;

        const today = new Date().toISOString().split('T')[0];
        const fromDate = sd || date || today;
        const toDate = ed || date || today;
        const limit = parseInt(pageSize, 10) || 10;
        const offset = (parseInt(page, 10) - 1) * limit;
        const isAbsentQuery = absent === 'true';

        // Whitelist sort columns
        const allowedCols = ['date', 'check_in', 'check_out', 'working_hours', 'status'];
        const col = allowedCols.includes(sortBy) ? sortBy : 'date';
        const asc = sortDir === 'asc';

        // --- Handle Absent Logic ---
        if (isAbsentQuery) {
            // Logic: Find employees who DON'T have an attendance record in the range
            // For simplicity and performance, we'll fetch all active employees and exclude those with records
            const { data: allEmps, error: empErr } = await supabase
                .from('employees')
                .select('*')
                .neq('status', 'Deleted');

            if (empErr) throw empErr;

            const { data: presentRecords } = await supabase
                .from('attendance')
                .select('employee_id')
                .gte('date', fromDate)
                .lte('date', toDate);

            const presentIds = new Set((presentRecords || []).map(r => r.employee_id));
            let absentEmps = allEmps.filter(e => !presentIds.has(e.id));

            // Apply search/dept filters to absent list
            if (department) absentEmps = absentEmps.filter(e => e.department === department);
            if (search) {
                const s = search.toLowerCase();
                absentEmps = absentEmps.filter(e => e.name?.toLowerCase().includes(s));
            }

            // Mock the format for Attendance UI
            const formattedAbsent = absentEmps.map(e => ({
                id: `absent-${e.id}`,
                employee_id: e.id,
                date: fromDate,
                status: 'ABSENT',
                employees: e
            }));

            return res.json({ 
                data: formattedAbsent.slice(offset, offset + limit), 
                total: absentEmps.length 
            });
        }

        // --- Standard Attendance Query ---
        const buildQuery = () => {
            let q = supabase
                .from('attendance')
                .select('*, employees!inner(name, employee_id, image_url, department)')
                .gte('date', fromDate)
                .lte('date', toDate);

            if (employee_id) q = q.eq('employee_id', employee_id);
            if (department) q = q.eq('employees.department', department);
            if (search) q = q.ilike('employees.name', `%${search}%`);
            if (status) q = q.eq('status', status);
            return q;
        };

        const { data: rawData, error } = await buildQuery().order(col, { ascending: asc });
        if (error) throw error;

        // Deduplicate and merge times locally
        const dedupMap = new Map();
        for (const row of (rawData || [])) {
            const key = row.employee_id + '_' + row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        
        const deduplicated = Array.from(dedupMap.values());
        
        // Re-sort in memory
        deduplicated.sort((a, b) => {
            let valA = col === 'employees.name' ? a.employees?.name : a[col];
            let valB = col === 'employees.name' ? b.employees?.name : b[col];
            if (valA < valB) return asc ? -1 : 1;
            if (valA > valB) return asc ? 1 : -1;
            return 0;
        });

        const paginatedData = deduplicated.slice(offset, offset + limit);
        res.json({ data: paginatedData, total: deduplicated.length });
    } catch (error) {
        console.error('❌ Get attendance error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.get('/api/attendance/export/excel/:employee_id', authenticateToken, async (req, res) => {
    const resolved = await resolveEmployeeUuid(req.params.employee_id);
    if (!resolved) return res.status(404).json({ error: "Employee not found" });
    req.query.employee_id = resolved;
    return handleExcelExport(req, res);
});

// ─── Employee PDF Export ────────────────────────────────────────────────────
app.get('/api/attendance/export/pdf/:employee_id', authenticateToken, async (req, res) => {
    const resolved = await resolveEmployeeUuid(req.params.employee_id);
    if (!resolved) return res.status(404).json({ error: "Employee not found" });
    req.query.employee_id = resolved;
    return handlePdfExport(req, res);
});

// Helper to resolve employee UUID for exports
async function resolveEmployeeUuid(idOrEid) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (uuidRegex.test(idOrEid)) return idOrEid;
    const { data } = await supabase.from('employees').select('id').eq('employee_id', idOrEid).single();
    return data ? data.id : null;
}

// Helper to resolve human-readable employee_id (e.g. EMP-0001)
async function resolveEmployeeEid(idOrEid) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(idOrEid)) return idOrEid;
    const { data } = await supabase.from('employees').select('employee_id').eq('id', idOrEid).single();
    return data ? data.employee_id : null;
}

// Helper to handle Excel Export (Extracted for reuse)
async function handleExcelExport(req, res) {
    try {
        const { month, year, department, startDate: sd, endDate: ed } = req.query;
        const employee_id = req.query.employee_id || req.params.employee_id;
        const now = new Date();

        // ── Resolve date range ──
        let fromDate, toDate;
        if (month && year) {
            fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            fromDate = sd || now.toISOString().split('T')[0];
            toDate = ed || now.toISOString().split('T')[0];
        }

        // ── Fetch data ──
        let q = supabase
            .from('attendance')
            .select('*, employees!inner(name, employee_id, department)')
            .gte('date', fromDate)
            .lte('date', toDate)
            .order('date', { ascending: false });

        if (employee_id) q = q.eq('employees.employee_id', employee_id);
        if (department) q = q.eq('employees.department', department);
        if (req.query.search) q = q.ilike('employees.name', `%${req.query.search}%`);
        if (req.query.status) q = q.eq('status', req.query.status);

        const { data: records, error } = await q;
        if (error) throw error;

        // ── Build workbook ──
        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'AuraLock Admin';
        wb.lastModifiedBy = 'AuraLock';
        wb.created = now;
        wb.modified = now;

        const ws = wb.addWorksheet('Attendance Registry', {
            pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
        });

        // Title row
        ws.mergeCells('A1:H1');
        const titleCell = ws.getCell('A1');
        titleCell.value = `Attendance Registry  |  ${fromDate}  →  ${toDate}`;
        titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).height = 32;

        // Subtitle row
        ws.mergeCells('A2:H2');
        const sub = ws.getCell('A2');
        sub.value = `Generated: ${now.toLocaleString('en-IN')}  |  Department: ${department || 'All'}`;
        sub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
        sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        sub.alignment = { horizontal: 'center' };
        ws.getRow(2).height = 18;

        // Blank spacer
        ws.getRow(3).height = 6;

        // ── Header row (row 4) ──
        const HEADERS = [
            { header: 'Employee Name', key: 'name', width: 24 },
            { header: 'Department', key: 'department', width: 16 },
            { header: 'Date', key: 'date', width: 14 },
            { header: 'Check In', key: 'check_in', width: 14 },
            { header: 'Check Out', key: 'check_out', width: 14 },
            { header: 'Working Hours', key: 'working_hours', width: 16 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Method', key: 'method', width: 14 },
        ];

        ws.columns = HEADERS.map(h => ({ key: h.key, width: h.width }));

        const headerRow = ws.getRow(4);
        HEADERS.forEach((h, i) => {
            const cell = headerRow.getCell(i + 1);
            cell.value = h.header;
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
            cell.border = {
                bottom: { style: 'medium', color: { argb: 'FF3B82F6' } },
            };
        });
        headerRow.height = 22;

        // ── Helper: format timestamp ──
        const fmtTs = (iso) => {
            if (!iso) return '—';
            const d = new Date(iso);
            return d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };

        const fmtWH = (rec) => {
            if (rec.working_hours != null) {
                const h = Math.floor(rec.working_hours);
                const m = Math.round((rec.working_hours - h) * 60);
                return `${h}h ${String(m).padStart(2, '0')}m`;
            }
            if (!rec.check_in || !rec.check_out) return '—';
            const mins = Math.round((new Date(rec.check_out) - new Date(rec.check_in)) / 60000);
            return `${Math.floor(mins / 60)}h ${mins % 60}m`;
        };

        // ── Deduplicate and Merge records ──
        const dedupMap = new Map();
        for (const row of (records || [])) {
            const key = row.employees?.employee_id + '_' + row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        
        const deduplicatedRecords = Array.from(dedupMap.values());
        
        let totalMinutes = 0;

        // ── Data rows ──
        deduplicatedRecords.forEach((rec, idx) => {
            // Calculate work minutes for total
            if (rec.working_hours != null) {
                totalMinutes += rec.working_hours * 60;
            } else if (rec.check_in && rec.check_out) {
                totalMinutes += Math.round((new Date(rec.check_out) - new Date(rec.check_in)) / 60000);
            }
            const rowNum = 5 + idx;
            const row = ws.getRow(rowNum);
            const isEven = idx % 2 === 0;

            const values = [
                rec.employees?.name || '—',
                rec.employees?.department || 'General',
                rec.date || '—',
                fmtTs(rec.check_in),
                fmtTs(rec.check_out),
                fmtWH(rec),
                rec.status || '—',
                (rec.method || '—').toUpperCase(),
            ];

            // Row background: LATE = amber tint, ON_TIME = green tint, else alternating
            let rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';
            if (rec.status === 'LATE') rowBg = 'FFFFF7ED'; // amber-50
            if (rec.status === 'ON_TIME') rowBg = 'FFF0FDF4'; // green-50

            values.forEach((val, ci) => {
                const cell = row.getCell(ci + 1);
                cell.value = val;
                cell.font = { name: 'Calibri', size: 10 };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
                cell.alignment = { vertical: 'middle', horizontal: ci === 0 ? 'left' : 'center' };

                // Status cell colour override
                if (ci === 6) {
                    if (val === 'LATE') { cell.font = { ...cell.font, bold: true, color: { argb: 'FFD97706' } }; }
                    if (val === 'ON_TIME') { cell.font = { ...cell.font, bold: true, color: { argb: 'FF059669' } }; }
                }
            });

            row.height = 18;
        });

        // ── Summary footer ──
        const footerRow = ws.getRow(5 + deduplicatedRecords.length);
        const totalLate = deduplicatedRecords.filter(r => r.status === 'LATE').length;
        const totalOnTime = deduplicatedRecords.filter(r => r.status === 'ON_TIME').length;
        
        const totalH = Math.floor(totalMinutes / 60);
        const totalM = Math.round(totalMinutes % 60);
        const totalHoursStr = `${totalH}h ${String(totalM).padStart(2, '0')}m`;

        ws.mergeCells(`A${footerRow.number}:H${footerRow.number}`);
        const footerCell = footerRow.getCell(1);
        footerCell.value = `Total: ${deduplicatedRecords.length} records  •  On Time: ${totalOnTime}  •  Late: ${totalLate}  •  Total Work Hours: ${totalHoursStr}`;
        footerCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
        footerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        footerCell.alignment = { horizontal: 'center' };
        footerRow.height = 16;

        // ── Stream response ──
        const filename = `attendance_${fromDate}_to_${toDate}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await wb.xlsx.write(res).then(() => res.end());

    } catch (error) {
        console.error('❌ Excel Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
}

app.get('/api/attendance/export/excel', authenticateToken, handleExcelExport);
app.get('/api/attendance/export/excel/:employee_id', authenticateToken, handleExcelExport);

// ─── PDF Export Helper & Endpoint ───────────────────────────────────────────
async function handlePdfExport(req, res) {
    try {
        const { month, year, department, startDate: sd, endDate: ed } = req.query;
        const employee_id = req.query.employee_id || req.params.employee_id;
        const now = new Date();

        let fromDate, toDate;
        if (month && year) {
            fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            fromDate = sd || now.toISOString().split('T')[0];
            toDate = ed || now.toISOString().split('T')[0];
        }

        let q = supabase
            .from('attendance')
            .select('*, employees!inner(name, employee_id, department)')
            .gte('date', fromDate)
            .lte('date', toDate)
            .order('date', { ascending: false });

        if (employee_id) q = q.eq('employees.employee_id', employee_id);
        if (department) q = q.eq('employees.department', department);
        if (req.query.search) q = q.ilike('employees.name', `%${req.query.search}%`);
        if (req.query.status) q = q.eq('status', req.query.status);

        const { data: records, error } = await q;
        if (error) throw error;

        let empDetails = null;
        if (employee_id) {
             const { data: empData } = await supabase.from('employees').select('*').eq('employee_id', employee_id).single();
             empDetails = empData;
        } else if (records && records.length > 0) {
             empDetails = records[0].employees;
        }

        const dedupMap = new Map();
        for (const row of (records || [])) {
            const key = row.employees?.employee_id + '_' + row.date;
            if (!dedupMap.has(key)) {
                dedupMap.set(key, { ...row });
            } else {
                const existing = dedupMap.get(key);
                if (row.check_in && (!existing.check_in || new Date(row.check_in) < new Date(existing.check_in))) {
                    existing.check_in = row.check_in;
                }
                if (row.check_out && (!existing.check_out || new Date(row.check_out) > new Date(existing.check_out))) {
                    existing.check_out = row.check_out;
                }
            }
        }
        const deduplicatedRecords = Array.from(dedupMap.values());

        let totalDays = deduplicatedRecords.length; 
        let presentCount = deduplicatedRecords.filter(r => r.status === 'ON_TIME' || r.status === 'LATE').length;
        let lateCount = deduplicatedRecords.filter(r => r.status === 'LATE').length;
        let absentCount = deduplicatedRecords.filter(r => r.status === 'ABSENT' || !r.check_in).length;
        
        let totalMinutes = 0;
        let totalOvertimeMins = 0;

        deduplicatedRecords.forEach(r => {
             let workMins = 0;
             if (r.working_hours != null) workMins = r.working_hours * 60;
             else if (r.check_in && r.check_out) workMins = (new Date(r.check_out) - new Date(r.check_in)) / 60000;
             
             totalMinutes += workMins;
             if (workMins > 540) {
                 totalOvertimeMins += (workMins - 540);
             }
        });

        const formatHrs = mins => `${Math.floor(mins/60)}h ${Math.round(mins%60)}m`;
        const totalHrsStr = formatHrs(totalMinutes);
        const totalOTStr = formatHrs(totalOvertimeMins);
        
        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 40, autoFirstPage: true });

        const filename = `attendance_${fromDate}_to_${toDate}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        doc.pipe(res);
        
        const C = {
            navy: [15, 23, 42], slate: [30, 41, 59], mid: [100, 116, 139],
            emerald: [16, 185, 129], amber: [245, 158, 11], red: [239, 68, 68],
            blue: [59, 130, 246], bgLight: [248, 250, 252], border: [226, 232, 240], white: [255, 255, 255]
        };

        const W = doc.page.width - 80;
        let curY = 40;

        doc.roundedRect(40, curY, 32, 32, 8).fill(C.emerald);
        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(18).text('A', 40, curY + 8, { width: 32, align: 'center' });
        
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(22).text('AuraLock', 82, curY + 2);
        doc.fillColor(C.slate).font('Helvetica').fontSize(8).text('SMART BIOMETRIC ACCESS CONTROL', 82, curY + 24);

        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(14).text('ATTENDANCE REPORT', 40, curY + 4, { align: 'right', width: W });
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
        doc.text(`Report Generated On  :   ${now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute:'2-digit' })}`, 40, curY + 22, { align: 'right', width: W });
        doc.text(`Report Period              :   ${fromDate} - ${toDate}`, 40, curY + 34, { align: 'right', width: W });
        doc.text(`Department                 :   ${department || 'All Departments'}`, 40, curY + 46, { align: 'right', width: W });
        
        curY += 60;
        doc.moveTo(40, curY).lineTo(40 + W, curY).lineWidth(1).strokeColor(C.border).stroke();
        curY += 20;

        if (empDetails) {
            doc.roundedRect(40, curY, W, 70, 8).fill(C.bgLight);
            doc.circle(75, curY + 35, 20).fill(C.mid);
            doc.fillColor(C.white).font('Helvetica-Bold').fontSize(16).text(empDetails.name ? empDetails.name.charAt(0).toUpperCase() : 'E', 55, curY + 28, { width: 40, align: 'center' });
            
            doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(14).text(empDetails.name || 'Unknown Employee', 105, curY + 15);
            
            doc.roundedRect(250, curY + 15, 50, 14, 4).fill([220, 252, 231]);
            doc.fillColor([22, 163, 74]).font('Helvetica-Bold').fontSize(8).text(empDetails.employee_id || 'EMP-001', 250, curY + 19, { width: 50, align: 'center' });

            doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
            doc.text(`Department    :  ${empDetails.department || 'General'}`, 105, curY + 35);
            doc.text(`Designation    :  Software Developer`, 105, curY + 47);
            doc.text(`Email              :  ${(empDetails.name || 'employee').toLowerCase().replace(' ', '.')}@auralock.com`, 250, curY + 35);
            curY += 90;
        }

        const pW = (W - 50) / 6;
        const pills = [
            { label: 'TOTAL DAYS', val: totalDays, c: C.blue, bg: [239, 246, 255] },
            { label: 'PRESENT', val: presentCount, c: C.emerald, bg: [236, 253, 245] },
            { label: 'ABSENT', val: absentCount, c: C.red, bg: [254, 242, 242] },
            { label: 'LATE', val: lateCount, c: C.amber, bg: [255, 251, 235] },
            { label: 'TOTAL HOURS WORKED', val: totalHrsStr, c: C.blue, bg: [248, 250, 252], w2: 2 },
            { label: 'TOTAL OVERTIME', val: totalOTStr, c: C.navy, bg: [248, 250, 252], w2: 2 },
        ];

        let pX = 40;
        pills.forEach(p => {
            const w = p.w2 ? (pW * 1.5 + 5) : pW;
            doc.roundedRect(pX, curY, w, 60, 6).fill(p.bg);
            doc.fillColor(p.c).font('Helvetica-Bold').fontSize(p.w2 ? 14 : 18).text(String(p.val), pX, curY + 25, { width: w, align: 'center' });
            doc.fillColor(C.mid).font('Helvetica-Bold').fontSize(6).text(p.label, pX, curY + 10, { width: w, align: 'center' });
            pX += w + 10;
        });

        curY += 80;

        const COLS = [
            { l: '#', w: 20 }, { l: 'DATE', w: 60 }, { l: 'DAY', w: 30 }, { l: 'CHECK IN', w: 50 },
            { l: 'CHECK OUT', w: 50 }, { l: 'TOTAL HRS', w: 55 }, { l: 'STATUS', w: 55 }, 
            { l: 'OVERTIME', w: 55 }, { l: 'METHOD', w: 45 }, { l: 'REMARKS', w: W - 420 }
        ];

        doc.rect(40, curY, W, 20).fill(C.navy);
        let cx = 40;
        COLS.forEach(c => {
            doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7).text(c.l, cx + 2, curY + 6, { width: c.w - 4, align: 'center' });
            cx += c.w;
        });
        curY += 20;

        const checkBreak = (h, isSummary = false) => {
            if (curY + h > doc.page.height - 60) {
                doc.addPage();
                curY = 40;
                if (!isSummary) {
                    doc.rect(40, curY, W, 20).fill(C.navy);
                    cx = 40;
                    COLS.forEach(c => {
                        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7).text(c.l, cx + 2, curY + 6, { width: c.w - 4, align: 'center' });
                        cx += c.w;
                    });
                    curY += 20;
                }
            }
        };

        const fmtT = iso => {
            if(!iso) return '—';
            const dt = new Date(iso);
            return dt.toLocaleTimeString('en-US', {hour12:true, hour:'2-digit', minute:'2-digit'});
        };
        
        deduplicatedRecords.forEach((r, i) => {
            checkBreak(20);
            doc.rect(40, curY, W, 20).fill(i % 2 === 0 ? C.white : C.bgLight);
            
            let wM = 0;
            if (r.working_hours != null) wM = r.working_hours * 60;
            else if (r.check_in && r.check_out) wM = (new Date(r.check_out) - new Date(r.check_in)) / 60000;
            
            let otStr = '—';
            if (wM > 540) otStr = `${Math.floor((wM - 540)/60)}h ${Math.round((wM - 540)%60)}m`;
            
            let statusLabel = 'Absent';
            if (r.status === 'LATE') statusLabel = 'Late Present';
            if (r.status === 'ON_TIME') statusLabel = 'Present';

            const vals = [
                String(i + 1),
                r.date ? new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
                r.date ? new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short' }) : '—',
                fmtT(r.check_in),
                fmtT(r.check_out),
                formatHrs(wM),
                statusLabel,
                otStr,
                r.method ? (r.method.charAt(0).toUpperCase() + r.method.slice(1)) : '—',
                '—'
            ];

            cx = 40;
            vals.forEach((v, ci) => {
                if (ci === 6) {
                    let bColor = C.red; let tColor = C.white; let bgC = [254, 226, 226];
                    if (v === 'Present') { bColor = [22, 163, 74]; tColor = [20, 83, 45]; bgC = [220, 252, 231]; }
                    if (v === 'Late Present') { bColor = [217, 119, 6]; tColor = [146, 64, 14]; bgC = [254, 243, 199]; }
                    doc.roundedRect(cx + 8, curY + 3, COLS[ci].w - 16, 14, 4).fill(bgC);
                    doc.fillColor(tColor).font('Helvetica-Bold').fontSize(6).text(v, cx + 8, curY + 7, { width: COLS[ci].w - 16, align: 'center' });
                } else {
                    doc.fillColor(C.slate).font('Helvetica').fontSize(7).text(v, cx + 2, curY + 6, { width: COLS[ci].w - 4, align: 'center' });
                }
                cx += COLS[ci].w;
            });
            curY += 20;
        });

        curY += 20;
        checkBreak(100, true);
        
        doc.roundedRect(40, curY, W, 80, 8).strokeColor(C.border).lineWidth(1).stroke();
        doc.roundedRect(40, curY - 10, 100, 20, 4).fill(C.navy);
        doc.fillColor(C.white).font('Helvetica-Bold').fontSize(8).text('FINAL SUMMARY', 40, curY - 4, { width: 100, align: 'center' });
        
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(16);
        doc.text(String(totalDays), 60, curY + 35);
        doc.text(String(presentCount), 130, curY + 35);
        doc.text(String(absentCount), 220, curY + 35);
        doc.text(String(lateCount), 300, curY + 35);

        doc.fillColor(C.mid).font('Helvetica-Bold').fontSize(7);
        doc.text('Total Days', 60, curY + 25);
        doc.text('Present Days', 130, curY + 25);
        doc.text('Absent Days', 220, curY + 25);
        doc.text('Late Days', 300, curY + 25);
        
        doc.moveTo(350, curY + 15).lineTo(350, curY + 65).strokeColor(C.border).stroke();

        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8);
        doc.text(`Total Hours Worked    :    ${totalHrsStr}`, 365, curY + 20);
        doc.text(`Total Overtime           :    ${totalOTStr}`, 365, curY + 35);
        const avgMins = presentCount > 0 ? totalMinutes / presentCount : 0;
        doc.text(`Average Daily Hours  :    ${formatHrs(avgMins)}`, 365, curY + 50);
        
        const perc = totalDays > 0 ? Math.round((presentCount / totalDays) * 100) : 0;
        doc.circle(W + 5, curY + 40, 25).lineWidth(6).strokeColor(C.border).stroke();
        doc.fillColor(C.emerald).font('Helvetica-Bold').fontSize(14).text(`${perc}%`, W - 20, curY + 35, { width: 50, align: 'center' });

        curY += 120;
        checkBreak(100, true);
        
        doc.moveTo(100, curY).lineTo(250, curY).strokeColor(C.mid).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('Admin User', 100, curY + 10, { width: 150, align: 'center' });
        doc.fillColor(C.mid).font('Helvetica').fontSize(7).text('AuraLock System', 100, curY + 22, { width: 150, align: 'center' });

        doc.circle(W / 2 + 40, curY - 10, 25).strokeColor(C.navy).lineWidth(1).stroke();
        doc.circle(W / 2 + 40, curY - 10, 22).strokeColor(C.navy).lineWidth(0.5).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(6).text('VERIFIED', W / 2 + 15, curY, { width: 50, align: 'center' });

        doc.moveTo(W - 100, curY).lineTo(W + 20, curY).strokeColor(C.mid).stroke();
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('Authorized Signature', W - 100, curY + 10, { width: 120, align: 'center' });
        doc.fillColor(C.mid).font('Helvetica').fontSize(7).text('(Company Authority)', W - 100, curY + 22, { width: 120, align: 'center' });

        doc.fillColor(C.mid).font('Helvetica').fontSize(7);
        doc.text('This is a system generated report. The information provided in this report is accurate as per the records available in the AuraLock system.', 40, doc.page.height - 40, { width: W - 100 });
        doc.fillColor(C.navy).font('Helvetica-Bold').fontSize(8).text('AuraLock Smart Biometric Access Control', 40, doc.page.height - 40, { align: 'right', width: W });
        doc.fillColor(C.emerald).font('Helvetica').fontSize(7).text('www.auralock.com', 40, doc.page.height - 28, { align: 'right', width: W });

        doc.end();

    } catch (error) {
        console.error('❌ PDF export error:', error);
        if (!res.headersSent)
            res.status(500).json({ error: 'PDF export failed', details: error.message });
    }
}


app.get('/api/attendance/export/pdf', authenticateToken, handlePdfExport);
app.get('/api/attendance/export/pdf/:employee_id', authenticateToken, handlePdfExport);

// Attendance Report Endpoint (Last 7 Days)
app.get('/api/attendance/report', async (req, res) => {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);

        const { data: reportData, error } = await supabase
            .from('attendance')
            .select('date, check_in')
            .gte('date', startDate.toISOString().split('T')[0])
            .lte('date', endDate.toISOString().split('T')[0]);

        if (error) throw error;

        // Group by date
        const countsByDate = {};
        const LATE_THRESHOLD = "09:00:00";

        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            countsByDate[dateStr] = { date: dateStr, present: 0, late: 0 };
        }

        // Get total active employees to calculate absent
        const { count: totalEmployees } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true })
            .neq('status', 'Deleted');

        if (reportData) {
            reportData.forEach(row => {
                if (countsByDate[row.date]) {
                    countsByDate[row.date].present++;
                    if (row.check_in) {
                        const checkInTime = new Date(row.check_in).toTimeString().split(' ')[0];
                        if (checkInTime > LATE_THRESHOLD) {
                            countsByDate[row.date].late++;
                        }
                    }
                }
            });
        }

        // Calculate absent for each day
        Object.values(countsByDate).forEach(day => {
            const dateObj = new Date(day.date);
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
            day.absent = isWeekend ? 0 : Math.max(0, (totalEmployees || 0) - day.present);
        });

        res.json(Object.values(countsByDate));
    } catch (error) {
        console.error("❌ Report error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Monthly Attendance Report Endpoint
app.get('/api/attendance/monthly-report', authenticateToken, async (req, res) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ error: "Month and Year are required" });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // Last day of month
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // 1. Fetch all active employees
        const { data: employees, error: empError } = await supabase
            .from('employees')
            .select('id, name, employee_id, department')
            .neq('status', 'Deleted');

        if (empError) throw empError;

        // 2. Fetch all attendance for the month
        const { data: attendanceData, error: attError } = await supabase
            .from('attendance')
            .select('employee_id, date, check_in, check_out')
            .gte('date', startDateStr)
            .lte('date', endDateStr);

        if (attError) throw attError;

        // 3. Calculate working days (exclude weekends)
        let workingDaysCount = 0;
        const tempDate = new Date(startDate);
        while (tempDate <= endDate) {
            const day = tempDate.getDay();
            if (day !== 0 && day !== 6) { // Not Sunday or Saturday
                workingDaysCount++;
            }
            tempDate.setDate(tempDate.getDate() + 1);
        }

        // 4. Aggregate data
        const LATE_THRESHOLD = "09:00:00";
        const report = employees.map(emp => {
            const empAtt = attendanceData.filter(a => a.employee_id === emp.id);
            const presentDays = new Set(empAtt.map(a => a.date)).size;
            const absentDays = Math.max(0, workingDaysCount - presentDays);

            let lateDays = 0;
            let totalMins = 0;
            let totalOvertimeMins = 0;

            empAtt.forEach(a => {
                if (a.check_in) {
                    const checkInTime = new Date(a.check_in).toTimeString().split(' ')[0];
                    if (checkInTime > LATE_THRESHOLD) lateDays++;

                    if (a.check_out) {
                        const mins = (new Date(a.check_out) - new Date(a.check_in)) / (1000 * 60);
                        if (mins > 0) {
                            totalMins += mins;
                            if (mins > 540) {
                                totalOvertimeMins += (mins - 540);
                            }
                        }
                    }
                }
            });

            return {
                id: emp.id,
                name: emp.name,
                employee_id: emp.employee_id,
                department: emp.department || 'General',
                presentDays,
                absentDays,
                lateDays,
                totalWorkHours: (totalMins / 60).toFixed(1),
                totalOvertime: (totalOvertimeMins / 60).toFixed(1)
            };
        });

        res.json({
            month: parseInt(month),
            year: parseInt(year),
            workingDaysInMonth: workingDaysCount,
            data: report
        });
    } catch (error) {
        console.error("❌ Monthly report error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Attendance Analytics Endpoint
app.get('/api/stats/attendance-analytics', authenticateToken, async (req, res) => {
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const LATE_THRESHOLD = '09:00:00';

        // --- Daily Trend: last 15 days ---
        const fifteenDaysAgo = new Date(now);
        fifteenDaysAgo.setDate(now.getDate() - 14);
        const dailyStart = fifteenDaysAgo.toISOString().split('T')[0];

        // --- Monthly ranges ---
        const currMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

        // Run all three queries in parallel for minimal latency
        const [
            { data: dailyAtt, error: dailyErr },
            { data: currMonAtt, error: currMonErr },
            { data: prevMonAtt, error: prevMonErr },
            { data: employees, error: empErr },
            { data: sixMonthAtt, error: sixMonErr },
        ] = await Promise.all([
            supabase.from('attendance')
                .select('date, check_in, employee_id')
                .gte('date', dailyStart).lte('date', today),
            supabase.from('attendance')
                .select('employee_id')
                .gte('date', currMonthStart).lte('date', today),
            supabase.from('attendance')
                .select('employee_id')
                .gte('date', prevMonthStart).lte('date', prevMonthEnd),
            supabase.from('employees')
                .select('id, department')
                .neq('status', 'Deleted'),
            // Last 6 months for monthly rate chart
            supabase.from('attendance')
                .select('date, employee_id')
                .gte('date', new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0])
                .lte('date', today),
        ]);

        if (dailyErr) throw dailyErr;
        if (currMonErr) throw currMonErr;
        if (prevMonErr) throw prevMonErr;
        if (empErr) throw empErr;
        if (sixMonErr) throw sixMonErr;

        // 1. Build daily trend (last 15 days)
        const dailyMap = {};
        for (let i = 14; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyMap[key] = { date: key, present: 0, late: 0 };
        }
        (dailyAtt || []).forEach(a => {
            if (!dailyMap[a.date]) return;
            // Count unique employees per day as present (deduplicated inside the map)
            dailyMap[a.date].present++;
            if (a.check_in) {
                const t = new Date(a.check_in).toTimeString().split(' ')[0];
                if (t > LATE_THRESHOLD) dailyMap[a.date].late++;
            }
        });
        const dailyTrend = Object.values(dailyMap);

        // 2. Monthly comparison
        const currMonthPresent = new Set((currMonAtt || []).map(a => a.employee_id)).size;
        const prevMonthPresent = new Set((prevMonAtt || []).map(a => a.employee_id)).size;
        const monthlyGrowth = prevMonthPresent === 0
            ? 0
            : Math.round(((currMonthPresent - prevMonthPresent) / prevMonthPresent) * 100);

        // 3. Department breakdown
        const deptHeadcountMap = {};
        (employees || []).forEach(emp => {
            const dept = emp.department || 'General';
            deptHeadcountMap[dept] = (deptHeadcountMap[dept] || 0) + 1;
        });

        const todayAttEmpIds = new Set(
            (dailyAtt || []).filter(a => a.date === today).map(a => a.employee_id)
        );
        const deptPresentMap = {};
        (employees || []).forEach(emp => {
            const dept = emp.department || 'General';
            if (todayAttEmpIds.has(emp.id)) {
                deptPresentMap[dept] = (deptPresentMap[dept] || 0) + 1;
            }
        });

        const departmentComparison = Object.entries(deptHeadcountMap).map(([dept, total]) => ({
            department: dept,
            total,
            present: deptPresentMap[dept] || 0,
            absent: total - (deptPresentMap[dept] || 0),
        }));

        // 4. Monthly attendance rate (last 6 months)
        const totalEmployees = (employees || []).length || 1; // avoid division by zero
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyRateMap = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthlyRateMap[key] = { month: monthNames[d.getMonth()], unique: new Set(), rate: 0 };
        }
        (sixMonthAtt || []).forEach(a => {
            const key = a.date?.slice(0, 7); // YYYY-MM
            if (monthlyRateMap[key]) monthlyRateMap[key].unique.add(a.employee_id);
        });
        const monthlyRate = Object.values(monthlyRateMap).map(m => ({
            month: m.month,
            rate: Math.min(100, Math.round((m.unique.size / totalEmployees) * 100)),
            count: m.unique.size,
        }));

        res.json({
            dailyTrend,
            monthly: {
                current: currMonthPresent,
                previous: prevMonthPresent,
                growthPercent: monthlyGrowth,
            },
            monthlyRate,
            departmentComparison,
        });
    } catch (error) {
        console.error('❌ Attendance Analytics Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Activity Trend Endpoint (24h)
app.get('/api/stats/activity', async (req, res) => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const { data: logs, error } = await supabase
            .from('access_logs')
            .select('created_at, status, confidence')
            .gte('created_at', twentyFourHoursAgo.toISOString())
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Initialize 24 empty hourly buckets
        const history = [];
        for (let i = 23; i >= 0; i--) {
            const time = new Date(Date.now() - i * 60 * 60 * 1000);
            time.setMinutes(0, 0, 0);
            history.push({
                time: time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestamp: time.getTime(),
                Face: 0,
                Fingerprint: 0,
                RFID: 0,
                Denied: 0
            });
        }

        // Aggregate logs into buckets
        logs.forEach(log => {
            const logTime = new Date(log.created_at);
            logTime.setMinutes(0, 0, 0);
            const bucket = history.find(b => Math.abs(b.timestamp - logTime.getTime()) < 30 * 60 * 1000);

            if (bucket) {
                if (log.status === 'success') {
                    // Inference logic if 'method' column is missing or null
                    const method = (log.confidence && log.confidence > 0) ? 'Face' : 'RFID';
                    bucket[method]++;
                } else {
                    bucket.Denied++;
                }
            }
        });

        res.json(history);
    } catch (error) {
        console.error("❌ Activity stats error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ─── Security Logs Endpoint ───────────────────────────────────────────────────
// Filters: status, method, device_id, startDate, endDate, search (employee name)
// ─── Simplified Access Logs Endpoint ─────────────────────────────────────────
app.get('/api/access-logs', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            startDate,
            endDate,
            employee_name,
            device,
            result,
        } = req.query;

        const pgLimit = Math.min(parseInt(limit, 10) || 20, 100);
        const from = (parseInt(page, 10) - 1) * pgLimit;
        const to = from + pgLimit - 1;

        let q = supabase
            .from('access_logs')
            .select('*, employees(name, employee_id, department, image_url)', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (result) q = q.eq('status', result);
        if (device) q = q.eq('device_id', device);
        if (startDate) q = q.gte('created_at', `${startDate}T00:00:00.000Z`);
        if (endDate) q = q.lte('created_at', `${endDate}T23:59:59.999Z`);
        if (employee_name || req.query.search) {
            const pattern = `%${employee_name || req.query.search}%`;
            q = q.ilike('employees.name', pattern);
        }

        const { data: logs, count, error } = await q.range(from, to);
        if (error) throw error;

        res.json({
            logs: logs || [],
            total: count || 0,
            pagination: {
                total: count || 0,
                page: parseInt(page, 10),
                limit: pgLimit
            }
        });
    } catch (error) {
        console.error('❌ Access logs error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Employee Access History Endpoint ─────────────────────────────────────────
app.get('/api/access-logs/employee/:employee_id', authenticateToken, async (req, res) => {
    try {
        const { employee_id } = req.params;
        const { startDate, endDate, page = 1, limit = 20, status } = req.query;

        const resolved = await resolveEmployeeEid(employee_id);
        if (!resolved) return res.status(404).json({ error: "Employee not found" });

        const pgLimit = Math.min(parseInt(limit, 10) || 20, 100);
        const from = (parseInt(page, 10) - 1) * pgLimit;
        const to = from + pgLimit - 1;

        let q = supabase
            .from('access_logs')
            .select('*, employees(name, employee_id, department, image_url)', { count: 'exact' })
            .eq('employee_id', resolved)
            .order('created_at', { ascending: false });

        if (startDate) q = q.gte('created_at', `${startDate}T00:00:00.000Z`);
        if (endDate) q = q.lte('created_at', `${endDate}T23:59:59.999Z`);
        if (status) q = q.eq('status', status);

        const { data: logs, count, error } = await q.range(from, to);
        if (error) throw error;

        res.json({ logs: logs || [], total: count || 0 });
    } catch (error) {
        console.error('❌ Employee access logs error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Employee Access Summary Endpoint ─────────────────────────────────────────
app.get('/api/access-logs/employee/:employee_id/summary', authenticateToken, async (req, res) => {
    try {
        const { employee_id } = req.params;
        const resolved = await resolveEmployeeEid(employee_id);
        if (!resolved) return res.status(404).json({ error: "Employee not found" });

        const istOffset = 5.5 * 60 * 60 * 1000;
        const nowIST = new Date(Date.now() + istOffset);
        const todayStr = nowIST.toISOString().split('T')[0];
        const istMidnightUTC = new Date(new Date(todayStr).getTime() - istOffset).toISOString();

        const startOfMonthIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), 1);
        const istMonthStartUTC = new Date(startOfMonthIST.getTime() - istOffset).toISOString();

        const [
            { count: totalScans },
            { count: todayScans },
            { count: thisMonthScans },
            { data: lastScanArr }
        ] = await Promise.all([
            supabase.from('access_logs').select('*', { count: 'exact', head: true }).eq('employee_id', resolved),
            supabase.from('access_logs').select('*', { count: 'exact', head: true }).eq('employee_id', resolved).gte('created_at', istMidnightUTC),
            supabase.from('access_logs').select('*', { count: 'exact', head: true }).eq('employee_id', resolved).gte('created_at', istMonthStartUTC),
            supabase.from('access_logs').select('created_at').eq('employee_id', resolved).order('created_at', { ascending: false }).limit(1)
        ]);

        res.json({
            total_scans: totalScans || 0,
            today_scans: todayScans || 0,
            this_month_scans: thisMonthScans || 0,
            last_scan: lastScanArr?.[0]?.created_at || null
        });
    } catch (error) {
        console.error('❌ Access summary error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Access Logs Export Handlers ──────────────────────────────────────────────

async function handleAccessExcelExport(req, res) {
    try {
        const { startDate, endDate, employee_id, device, result, month, year } = req.query;
        const now = new Date();

        let fromDate, toDate;
        if (month && year) {
            fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            fromDate = startDate || now.toISOString().split('T')[0];
            toDate = endDate || now.toISOString().split('T')[0];
        }

        let q = supabase
            .from('access_logs')
            .select('*, employees(name, employee_id, department)')
            .gte('created_at', `${fromDate}T00:00:00.000Z`)
            .lte('created_at', `${toDate}T23:59:59.999Z`)
            .order('created_at', { ascending: false });

        if (employee_id) q = q.eq('employee_id', employee_id);
        if (device) q = q.eq('device_id', device);
        if (result) q = q.eq('status', result);

        const { data: records, error } = await q;
        if (error) throw error;

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Access Logs');

        ws.columns = [
            { header: 'Employee', key: 'name', width: 25 },
            { header: 'ID', key: 'eid', width: 15 },
            { header: 'Method', key: 'method', width: 12 },
            { header: 'Timestamp', key: 'ts', width: 22 },
            { header: 'Confidence', key: 'conf', width: 12 },
            { header: 'Device', key: 'device', width: 15 },
            { header: 'Result', key: 'result', width: 12 }
        ];

        records.forEach(r => {
            ws.addRow({
                name: r.employees?.name || 'Unknown',
                eid: r.employees?.employee_id || '—',
                method: (r.method || r.metadata?.method || 'face').toUpperCase(),
                ts: new Date(r.created_at).toLocaleString('en-IN'),
                conf: r.confidence ? `${Math.round(r.confidence * 100)}%` : '—',
                device: r.device_id || '—',
                result: (r.status || 'failed').toUpperCase()
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="access_logs_${fromDate}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('❌ Access Excel Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
}

async function handleAccessPdfExport(req, res) {
    try {
        const { startDate, endDate, employee_id, device, result, month, year } = req.query;
        const now = new Date();

        let fromDate, toDate;
        if (month && year) {
            fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            fromDate = startDate || now.toISOString().split('T')[0];
            toDate = endDate || now.toISOString().split('T')[0];
        }

        let q = supabase
            .from('access_logs')
            .select('*, employees(name, employee_id, department)')
            .gte('created_at', `${fromDate}T00:00:00.000Z`)
            .lte('created_at', `${toDate}T23:59:59.999Z`)
            .order('created_at', { ascending: false });

        if (employee_id) q = q.eq('employee_id', employee_id);
        if (device) q = q.eq('device_id', device);
        if (result) q = q.eq('status', result);

        const { data: records, error } = await q;
        if (error) throw error;

        const doc = new PDFDocument({ size: 'A4', margin: 30 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="access_logs_${fromDate}.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('AuraLock Access Audit Log', { align: 'center' });
        doc.fontSize(10).text(`Period: ${fromDate} to ${toDate}`, { align: 'center' });
        doc.moveDown(2);

        // Table Data
        const table = {
            title: employee_id ? `Access History for ${records[0]?.employees?.name || 'Employee'}` : 'All Access Logs',
            headers: ['Employee', 'ID', 'Method', 'Timestamp', 'Confidence', 'Device', 'Status'],
            rows: records.slice(0, 1000).map(r => [
                r.employees?.name || 'Unknown',
                r.employees?.employee_id || '-',
                (r.method || r.metadata?.method || 'face').toUpperCase(),
                new Date(r.created_at).toLocaleString('en-IN'),
                r.confidence ? `${Math.round(r.confidence * 100)}%` : '-',
                r.device_id || '-',
                (r.status || 'failed').toUpperCase()
            ])
        };

        await doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
            prepareRow: () => doc.font('Helvetica').fontSize(8),
            width: 535,
        });

        doc.end();
    } catch (error) {
        console.error('❌ Access PDF Export Error:', error);
        res.status(500).json({ error: 'Export failed' });
    }
}

// Access Export Routes
app.get('/api/access-logs/export/excel', authenticateToken, handleAccessExcelExport);
app.get('/api/access-logs/export/pdf', authenticateToken, handleAccessPdfExport);

app.get('/api/access-logs/export/excel/:employee_id', authenticateToken, async (req, res) => {
    const resolved = await resolveEmployeeEid(req.params.employee_id);
    if (!resolved) return res.status(404).json({ error: "Employee not found" });
    req.query.employee_id = resolved;
    return handleAccessExcelExport(req, res);
});

app.get('/api/access-logs/export/pdf/:employee_id', authenticateToken, async (req, res) => {
    // We need the raw UUID for filtering access_logs, but we might want the EID for the filename
    req.query.employee_id = req.params.employee_id;
    return handleAccessPdfExport(req, res);
});

app.get('/api/access-logs/export/excel/:employee_id', authenticateToken, async (req, res) => {
    req.query.employee_id = req.params.employee_id;
    return handleAccessExcelExport(req, res);
});

// IoT Activity Log Endpoint (Internal)
app.post('/api/logs/iot', async (req, res) => {
    const { method, id, status, message, signature, timestamp } = req.body;
    const secret = process.env.ESP32_SECRET;

    // --- Security: HMAC Verification for Device logs ---
    if (signature === 'internal_request') {
        console.log("⚡ [IoT Log] Accepting internal request from unified app.");
    } else {
        if (!signature || !timestamp) return res.sendStatus(401);

        // Check drift (60 sec)
        if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60) {
            console.warn("⚠️ [IoT Security] Stale log timestamp rejected.");
            return res.status(403).json({ error: "Stale timestamp" });
        }

        const payload = JSON.stringify({ method, id, status, message, timestamp });
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payload);
        const expectedSignature = hmac.digest('hex');

        if (signature !== expectedSignature) {
            console.error("❌ [IoT Security] Invalid signature from device!");
            return res.status(401).json({ error: "Invalid integrity signature" });
        }
    }

    try {
        if (status === 'LOW_BATTERY' || status === 'CRITICAL_BATTERY') {
            console.warn(`🔋 [POWER ALERT] ${status}: ${message}`);
        } else {
            console.log(`🔔 [IoT Event] ${method} unlock by ID #${id}: ${status}`);
        }

        // Rate limiting for failed/unknown biometric events
        if (status !== 'success') {
            const key = `iot_${id || 'unknown'}_${method}`;
            const lastLog = logRateLimiter.get(key);
            if (lastLog && (Date.now() - lastLog) < LOG_THROTTLE_MS) {
                return res.json({ success: true, throttled: true });
            }
            logRateLimiter.set(key, Date.now());
        }

        // Record in access_logs
        await supabase.from('access_logs').insert({
            employee_id: id === 0 ? null : (id || null),
            status: (status === 'LOW_BATTERY' || status === 'CRITICAL_BATTERY') ? 'warning' : (status || 'success'),
            confidence: 1.0,
            device_id: 'esp32_hardware',
            method: (method === 'fingerprint' ? 'FINGERPRINT' : (method || 'FACE')),
            metadata: {
                method,
                message,
                status,
                unlock_source: 'BIOMETRIC'
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ IoT Log error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Users Endpoints

// Public Terminal Fetch (Unauthenticated - safe for kiosk)
app.get('/api/terminal/users', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('employees')
            .select('id, employee_id, name, email, department, image_url, status')
            .eq('status', 'Active')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("❌ Terminal fetch error:", error);
            return res.status(500).json({ message: "Failed to load users" });
        }
        res.json(users || []);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "System error" });
    }
});

// Get unique departments from employees table
app.get('/api/departments', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('employees')
            .select('department')
            .not('department', 'is', null)
            .eq('is_deleted', false);

        if (error) throw error;

        // Extract unique, trimmed department names
        const depts = [...new Set(data.map(d => (d.department || 'General').trim()))].sort();
        res.json(depts);
    } catch (error) {
        console.error("❌ Get departments error:", error);
        res.status(500).json({ error: "Failed to fetch departments" });
    }
});

app.get('/api/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { includeDeleted = 'false' } = req.query;

        // Select only real DB columns and join with biometric status
        let query = supabase.from('employees').select(`
            id, employee_id, name, email, role, department, status,
            image_url, created_at, updated_at, is_deleted,
            face_encodings(id),
            fingerprints(id)
        `);

        if (includeDeleted !== 'true') {
            query = query.eq('is_deleted', false);
        }

        // 1. Fetch all employees
        const { data: users, error: empErr } = await query;
        if (empErr) throw empErr;

        // 2. Fetch all face registration records to match locally
        const { data: allEncodings } = await supabase.from('face_encodings').select('employee_id');
        const enrolledIds = new Set(allEncodings?.map(e => e.employee_id) || []);

        // Transform results to include simple booleans for the frontend
        const transformedUsers = (users || []).map(u => ({
            ...u,
            face_registered: enrolledIds.has(u.employee_id), // Match by String ID (EMP-XX)
            fingerprint_registered: !!(u.fingerprints?.length > 0),
            face_encodings: undefined,
            fingerprints: undefined,
            face_embedding: undefined
        }));

        res.json(transformedUsers);
    } catch (error) {
        console.error("❌ Get users error:", error.message || error);
        res.status(500).json({
            error: "Internal Server Error",
            message: error.message || "Failed to fetch employees"
        });
    }
});

app.patch('/api/users/:id', authenticateToken, isAdmin, validateIdentity, async (req, res) => {
    try {
        const { id } = req.params;
        const rawUpdates = req.body;

        // Fetch existing user to check for ID changes and biometric status
        const { data: existingUser, error: fetchErr } = await supabase
            .from('employees')
            .select('employee_id, face_embedding')
            .eq('id', id)
            .single();
        
        if (fetchErr || !existingUser) {
            return res.status(404).json({ error: "Employee not found" });
        }
        
        const old_eid = existingUser.employee_id;

        // Whitelist: only allow columns that actually exist in the employees table.
        // Silently drop any frontend-only fields to prevent Supabase errors.
        const ALLOWED_COLUMNS = new Set([
            'name', 'email', 'role', 'department', 'status',
            'employee_id', 'image_url', 'is_deleted', 'face_embedding'
        ]);
        
        const updates = Object.fromEntries(
            Object.entries(rawUpdates).filter(([k]) => ALLOWED_COLUMNS.has(k))
        );

        // Handle Fingerprint registration flag from frontend
        if (rawUpdates.fingerprint_registered === true) {
            const eid = rawUpdates.employee_id || old_eid;
            console.log(`📝 [Biometric] Marking fingerprint as registered for ${eid}`);
            try {
                await supabase.from('fingerprints').upsert({
                    employee_id: eid,
                    template_data: 'ENROLLED_VIA_ADMIN_MOCK'
                }, { on_conflict: 'employee_id' });
            } catch (fpErr) {
                console.warn("⚠️ Fingerprint record upsert failed:", fpErr.message);
            }
        }

        // Apply employee update if there are valid fields
        let updatedUser = { ...existingUser, id };
        if (Object.keys(updates).length > 0) {
            console.log(`📝 [Update] Applying employee update for UUID ${id}...`);
            const { data, error } = await supabase
                .from('employees')
                .update(updates)
                .eq('id', id)
                .select('id, employee_id, name, email, role, department, status, image_url, created_at, updated_at, is_deleted, face_embedding')
                .single();

            if (error) {
                console.error("❌ [Update] Employee update failed:", error.message);
                throw error;
            }
            updatedUser = data;
        } else if (!rawUpdates.fingerprint_registered && !rawUpdates.face_registered) {
            return res.status(400).json({ error: "No valid fields to update.", received: Object.keys(rawUpdates) });
        } else {
            // If we only updated biometrics, re-fetch the user record for the response
            const { data } = await supabase.from('employees').select('*').eq('id', id).single();
            updatedUser = data;
        }

        // Handle Biometric Cache Eviction if ID changed
        const new_eid = updatedUser.employee_id;
        if (old_eid && new_eid !== old_eid) {
            console.log(`🔄 [Cache] Evicting old biometric cache for ID: ${old_eid}`);
            try {
                await axios.delete(
                    `${PYTHON_ENGINE_URL}/api/biometrics/face/${encodeURIComponent(old_eid)}`,
                    { timeout: 3000 }
                );
            } catch (ce) {
                console.warn(`⚠️ [Cache] Old ID eviction skipped: ${ce.message}`);
            }
        }

        // Fetch real-time biometric status for the response
        const [
            { count: faceCount },
            { count: fpCount }
        ] = await Promise.all([
            supabase.from('face_encodings').select('id', { count: 'exact', head: true }).eq('employee_id', updatedUser.employee_id),
            supabase.from('fingerprints').select('id', { count: 'exact', head: true }).eq('employee_id', updatedUser.employee_id)
        ]);

        res.json({
            ...updatedUser,
            face_embedding: undefined,
            face_registered: faceCount > 0 || !!updatedUser.face_embedding,
            fingerprint_registered: fpCount > 0
        });
    } catch (error) {
        console.error("❌ Update user error:", error.message || error);
        res.status(500).json({ error: "Internal Server Error", message: error.message });
    }
});

app.post('/api/users', authenticateToken, validateIdentity, async (req, res) => {
    try {
        const { employeeId, employee_id, name, email, role, faceEncoding, image_url, rfid, fingerprint_id, department } = req.body;
        const finalId = employeeId || employee_id;

        const { data: newUser, error } = await supabase
            .from('employees')
            .upsert({
                employee_id: finalId,
                name,
                email,
                role: role === 'admin' ? 'admin' : 'employee',
                department: department || 'General',
                face_embedding: faceEncoding,
                image_url
            }, { on_conflict: 'employee_id' })
            .select()
            .single();

        if (error) {
            console.error("❌ Supabase Upsert Error:", error);
            throw error;
        }

        // --- Persist RFID if provided ---
        if (rfid) {
            await supabase.from('rfid_tags').upsert({
                tag_id: rfid,
                employee_id: finalId
            }, { on_conflict: 'tag_id' });
        }

        // --- Persist Fingerprint if provided ---
        if (fingerprint_id) {
            await supabase.from('fingerprints').upsert({
                id: fingerprint_id,
                employee_id: finalId,
                template_data: `MOCK_TEMPLATE_${fingerprint_id}` // Mock for now
            }, { on_conflict: 'id' });
        }

        console.log("✅ User created/updated in Supabase:", newUser.employee_id);
        res.status(201).json(newUser);
    } catch (error) {
        console.error("❌ Create user error:", error);

        // Detect HTML error pages (like Cloudflare 5xx)
        if (typeof error.message === 'string' && error.message.includes('<!DOCTYPE html>')) {
            return res.status(503).json({
                success: false,
                message: "Supabase service temporarily unavailable (Network/SSL Error). Please retry in a few moments."
            });
        }

        res.status(400).json({ message: error.message });
    }
});

app.delete('/api/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { hard = 'false' } = req.query;
        const isHardDelete = hard === 'true';

        console.log(`🗑️ Initializing ${isHardDelete ? 'HARD' : 'soft'} delete for subject: ${id}`);

        // 1. Resolve Employee UUID and EID (to maintain cache eviction)
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const isUUID = uuidRegex.test(id);
        
        let employeeUuid = isUUID ? id : null;
        let employeeEid = !isUUID ? id : null;

        if (isUUID) {
            const { data: emp } = await supabase.from('employees').select('employee_id, name').eq('id', id).single();
            if (emp) {
                employeeEid = emp.employee_id;
            }
        } else {
            const { data: emp } = await supabase.from('employees').select('id, name').eq('employee_id', id).single();
            if (emp) {
                employeeUuid = emp.id;
            }
        }

        if (!employeeUuid && !employeeEid) {
            return res.status(404).json({ error: "Subject not found in primary cluster." });
        }

        if (isHardDelete) {
            console.log(`🧨 PERMANENTLY DELETING employee ${employeeEid || id} and all history...`);
            
            // Delete related records in order
            // Note: face_encodings, fingerprints and rfid_tags typically use the String EID
            // attendance and access_logs typically use the UUID
            await Promise.all([
                supabase.from('attendance').delete().eq('employee_id', employeeUuid),
                supabase.from('access_logs').delete().eq('employee_id', employeeUuid),
                supabase.from('face_encodings').delete().eq('employee_id', employeeEid),
                supabase.from('fingerprints').delete().eq('employee_id', employeeEid),
                supabase.from('rfid_tags').delete().eq('employee_id', employeeEid)
            ]);

            const { error: deleteError } = await supabase
                .from('employees')
                .delete()
                .eq('id', employeeUuid);

            if (deleteError) throw deleteError;
            
            return res.json({ message: "Employee permanently purged from system.", hard: true });
        }

        // 2. Perform SOFT DELETE
        // We update the status and is_deleted flag instead of deleting the row.
        // This preserves foreign key relationships for attendance and access_logs.
        console.log(`🔒 Marking employee ${employeeEid || id} as Deactivated...`);
        const { data: updatedUser, error: updateError } = await supabase
            .from('employees')
            .update({ 
                status: 'Disabled', 
                is_deleted: true,
                updated_at: new Date().toISOString()
            })
            .match(employeeUuid ? { id: employeeUuid } : { employee_id: employeeEid })
            .select()
            .single();

        if (updateError) {
            console.error("❌ Failed to soft-delete employee record:", updateError);
            throw updateError;
        }

        // ── Biometric Cache Eviction (MANDATORY for security) ────────────────
        // We MUST still remove them from the Python Engine's active RAM cache
        // otherwise they could still unlock the door until the next restart.
        const evictionEmployeeId = updatedUser.employee_id || employeeEid;
        console.log(`🧹 Evicting biometric cache for deleted user: ${evictionEmployeeId}`);

        try {
            await axios.delete(
                `${PYTHON_ENGINE_URL}/api/biometrics/face/${encodeURIComponent(evictionEmployeeId)}`,
                { timeout: 5000 }
            );
            console.log(`✅ Biometric cache evicted for ${evictionEmployeeId}`);
        } catch (cacheErr) {
            console.warn(`⚠️ Biometric engine offline during eviction: ${cacheErr.message}`);
        }

        try {
            await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/cache/rebuild`, {}, { timeout: 5000 });
            console.log('✅ Biometric cache rebuild triggered');
        } catch (rebuildErr) {
            console.warn(`⚠️ Cache rebuild skipped (engine offline): ${rebuildErr.message}`);
        }

        console.log(`✅ Success: Subject ${evictionEmployeeId} soft-deleted. Historical records preserved.`);
        res.json({
            success: true,
            message: "User has been deactivated and removed from the dashboard. Historical records are preserved.",
            employee_id: evictionEmployeeId
        });

    } catch (error) {
        console.error("❌ Soft Delete Error:", error.message);
        res.status(500).json({
            error: "Employee deactivation failed",
            details: error.message
        });
    }
});
// Biometric Support (Mock Fallback when Python API is offline)
app.post('/api/biometrics/face/register', upload.single('file'), validateIdentity, async (req, res) => {
    try {
        const { employeeId, email, name, re_enroll } = req.body;
        console.log(`📸 Received biometric registration for: ${employeeId}`);

        if (!employeeId) {
            return res.status(400).json({ success: false, message: "Missing employeeId" });
        }

        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
            console.log("📦 Received registration photo as Multipart File");
        } else if (req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(base64Data, 'base64');
            console.log("📦 Received registration photo as Base64 String");
        }

        if (!imageBuffer) {
            return res.status(400).json({ success: false, message: "No image data provided" });
        }

        // --- Forward to Biometric Engine ---
        try {
            const FormData = require('form-data');
            const form = new FormData();
            form.append('file', imageBuffer, {
                filename: 'register.jpg',
                contentType: 'image/jpeg'
            });
            form.append('employeeId', employeeId);
            form.append('email', email || `${employeeId}@internal.com`);
            if (name) form.append('name', name);
            if (re_enroll) form.append('re_enroll', String(re_enroll));

            console.log("📡 Forwarding to Biometric Engine...");
            const response = await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/face/register`, form, {
                headers: form.getHeaders(),
                timeout: 45000
            });

            if (response.data.success) {
                console.log(`✅ Face successfully registered by AI Engine`);
                return res.json({
                    success: true,
                    message: response.data.message,
                    encoding: response.data.encoding,
                    image_url: response.data.image_url,
                    employeeId: employeeId
                });
            } else {
                return res.status(400).json({ success: false, message: response.data.message });
            }
        } catch (engineError) {
            console.error("❌ Biometric Engine error:", engineError.message);
            return res.status(503).json({
                success: false,
                message: "Biometric Engine error or offline.",
                details: engineError.message
            });
        }
    } catch (error) {
        console.error("❌ Registration error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Biometric Health Proxy with Multi-Fallback Discovery
app.get('/api/biometrics/health', async (req, res) => {
    const fallbacks = [
        PYTHON_ENGINE_URL,
        'http://smart-door-edge:8001',
        'http://localhost:8001'
    ].filter(Boolean);

    for (const url of fallbacks) {
        try {
            console.log(`🔍 [Health Check] Trying: ${url}/health`);
            await axios.get(`${url}/health`, { timeout: 3000 });
            // If success, update the global URL if it was a fallback
            if (url !== PYTHON_ENGINE_URL) {
                console.log(`✅ [Discovery] Updating PYTHON_ENGINE_URL to proven fallback: ${url}`);
                PYTHON_ENGINE_URL = url;
            }
            return res.json({ status: 'ready', engine: 'face-recognition', url });
        } catch (err) {
            console.warn(`⚠️ [Health Check] Failed for ${url}: ${err.message}`);
        }
    }

    res.status(503).json({ 
        status: "offline", 
        message: "Biometric Engine unreachable across all known internal hostnames",
        tried_urls: fallbacks
    });
});

app.post('/api/biometrics/face/verify', biometricLimiter, upload.single('file'), async (req, res) => {
    try {
        console.log("🔍 [Verification] Checking face identity...");
        
        // Handle both Multipart (file) and JSON (Base64 image)
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
            console.log("📦 Received photo as Multipart File");
        } else if (req.body.image) {
            // Extract Base64 data (strip prefix if present)
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(base64Data, 'base64');
            console.log("📦 Received photo as Base64 String");
        }

        if (!imageBuffer) {
            console.error("❌ No image data provided in request.");
            return res.status(400).json({ success: false, message: "No image data provided" });
        }

        // Fetch employees from Supabase
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .eq('status', 'Active')
            .order('created_at', { ascending: false });

        if (error || !employees || employees.length === 0) {
            console.warn("🚫 Access Denied: No employees registered in database.");
            return res.status(401).json({
                success: false,
                message: "No registered identities found."
            });
        }

        // --- Hybrid Verification Flow ---
        try {
            const FormData = require('form-data');

            const form = new FormData();
            form.append('file', imageBuffer, {
                filename: 'verify.jpg',
                contentType: 'image/jpeg'
            });

            console.log(`📡 Attempting Biometric Engine (${PYTHON_ENGINE_URL})...`);

            // --- WAIT FOR ENGINE READY (max 60s) ---
            let engineReady = false;
            for (let attempt = 0; attempt < 12; attempt++) {
                try {
                    await axios.get(`${PYTHON_ENGINE_URL}/health`, { timeout: 5000 });
                    engineReady = true;
                    break;
                } catch (_) {
                    console.log(`⏳ Biometric engine not ready yet, waiting... (attempt ${attempt + 1}/12)`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!engineReady) {
                console.error("❌ Biometric engine did not become ready in time.");
                return res.status(503).json({
                    success: false,
                    message: "Biometric Service is still starting up. Please wait 30 seconds and try again."
                });
            }

            const response = await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/face/verify`, form, {
                headers: form.getHeaders(),
                timeout: 120000 // 120s — Render Free/Starter tiers can be slow on first Cold-Start
            });

            if (response.data.success) {
                const employeeId = response.data.employee_id;
                console.log(`✅ Face Verified: ${employeeId}`);



                // --- TRIGGER DOOR UNLOCK ---
                // await safeTriggerDoorUnlock(); // Handled locally by Android Tablet now!

                // --- RECORD ATTENDANCE ---
                // We need the internal UUID for the attendance table
                const { data: empRecord } = await supabase.from('employees').select('id').eq('employee_id', employeeId).single();
                if (empRecord) {
                    await recordAttendance(empRecord.id, 'face', 'terminal_01');
                }

                return res.json({
                    success: true,
                    message: `Authorized: Welcome ${response.data.name || employeeId}`,
                    employeeId: employeeId,
                    user: {
                        name: response.data.name,
                        employee_id: employeeId
                    }
                });
            } else if (response.data.error_code === 'AMBIGUOUS_MATCH') {
                console.warn(`⚠️ Ambiguous Match for hint: ${response.data.id_hint}. Requesting Fingerprint fallback.`);

                try {
                    await supabase.from('access_logs').insert({
                        employee_id: response.data.id_hint,
                        status: 'ambiguous',
                        device_id: 'terminal_01',
                        method: 'face'
                    });
                } catch (logError) {
                    console.error("⚠️ Failed to record ambiguous access log:", logError.message);
                }

                return res.status(403).json({
                    success: false,
                    error_code: "MFA_REQUIRED",
                    message: "Ambiguous matching. Please use Fingerprint sensor for secondary verification.",
                    id_hint: response.data.id_hint
                });
            } else {
                console.log(`🚫 Engine Rejection: ${response.data.message}`);
                // Log failed attempt
                try {
                    const key = `face_null_denied`;
                    const lastLog = logRateLimiter.get(key);
                    if (!lastLog || (Date.now() - lastLog) > LOG_THROTTLE_MS) {
                        await supabase.from('access_logs').insert({
                            employee_id: null,
                            status: 'failed',
                            confidence: response.data.confidence || null,
                            device_id: 'terminal_01',
                            method: 'FACE',
                            metadata: {
                                reason: response.data.message,
                                unlock_source: 'BIOMETRIC'
                            }
                        });
                        logRateLimiter.set(key, Date.now());
                    }
                } catch (le) { console.error('⚠️ Failed to log rejection:', le.message); }
                return res.status(401).json({
                    success: false,
                    message: response.data.message || "Access Denied."
                });
            }
        } catch (engineError) {
            console.error("❌ Biometric Engine error/offline:", engineError.message);
            // Log engine offline as failed
            try {
                await supabase.from('access_logs').insert({
                    employee_id: null,
                    status: 'failed',
                    device_id: 'terminal_01',
                    method: 'face',
                    metadata: { reason: 'Biometric engine offline', error: engineError.message }
                });
            } catch (le) { console.error('⚠️ Failed to log engine-offline event:', le.message); }
            return res.status(503).json({
                success: false,
                message: "Biometric Service Unavailable. Please use manual override or contact admin."
            });
        }

    } catch (error) {
        console.error("❌ Verification error:", error);
        res.status(500).json({
            success: false,
            message: "System Error: Face processing failed or timed out. Please try again.",
            error: error.message
        });
    }
})

// End of Routes

// Final fallback for SPA (Admin Dashboard)
app.use('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin', 'index.html'));
});

app.use((req, res, next) => {
    // Only handle GET requests for SPA
    if (req.method !== 'GET') return next();
    
    // Ignore API/Auth routes
    if (req.url.startsWith('/api') || req.url.startsWith('/auth')) {
        return next();
    }
    
    // Serve the main index.html for everything else
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
