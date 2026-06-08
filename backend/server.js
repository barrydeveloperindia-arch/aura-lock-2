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
const { recordAttendance } = require('./src/controllers/attendanceController');

const app = express();
const PORT = process.env.PORT || 8000;

// Trust reverse proxy for rate limiter (required for Google Cloud Run)
app.set('trust proxy', 1);
// --- Configuration & Initialization ---
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@auralock.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '2026';
const JWT_SECRET = process.env.JWT_SECRET || 'auralock_super_secret_key_2026';

// â”€â”€ Service Discovery â”€â”€
let PYTHON_ENGINE_URL = process.env.PYTHON_ENGINE_URL || 'https://smart-door-edge-50851729985.asia-south1.run.app';

console.log('ðŸ§¬ [Biometrics] Target Engine:', PYTHON_ENGINE_URL);
console.log('ðŸš€ [Config] ADMIN_EMAIL:', ADMIN_EMAIL);
console.log('ðŸš€ [Config] JWT_SECRET:', JWT_SECRET ? 'SET' : 'MISSING');

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
    console.log(`ðŸ“¡ [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        const logBody = { ...req.body };
        if (logBody.faceEncoding) logBody.faceEncoding = "[ENCODING_DATA]";
        console.log('ðŸ“¦ Body:', JSON.stringify(logBody, null, 2));
    }
    next();
});

// --- Middleware ---
const { authenticateToken, isAdmin } = require('./src/middleware/auth');
const { resolveEmployeeUuid, resolveEmployeeEid } = require('./src/controllers/attendanceController');


// --- IoT Utilities ---
/**
 * Safely triggers the door unlock without breaking the main flow
 */
const safeTriggerDoorUnlock = async () => {
    try {
        console.log("ðŸ”“ [Trigger] Calling door unlock service...");
        const result = await doorService.unlockDoor();
        if (!result.success) {
            console.warn(`âš ï¸ [Trigger] Door unlock service reported failure: ${result.message}`);
        } else {
            console.log("âœ… [Trigger] Door unlock service successful");
        }
    } catch (error) {
        console.error("âŒ [Trigger] Critical error calling door unlock service:", error.message);
    }
};

// --- Routes ---
const bleRoutes = require('./ble_route');
const doorRoute = require('./door_route');
app.use('/api/ble', authenticateToken, isAdmin, bleRoutes);

app.get('/api/door/poll', (req, res) => {
    if (global.remoteUnlockRequested) {
        global.remoteUnlockRequested = false;
        return res.json({ unlock: true });
    }
    return res.json({ unlock: false });
});

app.use('/api/door', authenticateToken, isAdmin, doorRoute);

// --- Authentication Routes ---
const authRoutes = require('./src/routes/authRoutes');
app.use('/', authRoutes);

// --- Dashboard Stats Route ---
const statsRoutes = require('./src/routes/statsRoutes');
app.use('/', statsRoutes);

const attendanceRoutes = require('./src/routes/attendanceRoutes');
app.use('/api/attendance', attendanceRoutes);
// Activity and Analytics were previously under /api/stats, so we'll mount them explicitly
app.use('/api/stats', attendanceRoutes);


// â”€â”€â”€ Security Logs Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Filters: status, method, device_id, startDate, endDate, search (employee name)
// â”€â”€â”€ Simplified Access Logs Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        console.error('âŒ Access logs error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// â”€â”€â”€ Employee Access History Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        console.error('âŒ Employee access logs error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// â”€â”€â”€ Employee Access Summary Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        console.error('âŒ Access summary error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// â”€â”€â”€ Access Logs Export Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                eid: r.employees?.employee_id || 'â€”',
                method: (r.method || r.metadata?.method || 'face').toUpperCase(),
                ts: new Date(r.created_at).toLocaleString('en-IN'),
                conf: r.confidence ? `${Math.round(r.confidence * 100)}%` : 'â€”',
                device: r.device_id || 'â€”',
                result: (r.status || 'failed').toUpperCase()
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="access_logs_${fromDate}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('âŒ Access Excel Export Error:', error);
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
        console.error('âŒ Access PDF Export Error:', error);
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
        console.log("âš¡ [IoT Log] Accepting internal request from unified app.");
    } else {
        if (!signature || !timestamp) return res.sendStatus(401);

        // Check drift (60 sec)
        if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 60) {
            console.warn("âš ï¸ [IoT Security] Stale log timestamp rejected.");
            return res.status(403).json({ error: "Stale timestamp" });
        }

        const payload = JSON.stringify({ method, id, status, message, timestamp });
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(payload);
        const expectedSignature = hmac.digest('hex');

        if (signature !== expectedSignature) {
            console.error("âŒ [IoT Security] Invalid signature from device!");
            return res.status(401).json({ error: "Invalid integrity signature" });
        }
    }

    try {
        if (status === 'LOW_BATTERY' || status === 'CRITICAL_BATTERY') {
            console.warn(`ðŸ”‹ [POWER ALERT] ${status}: ${message}`);
        } else {
            console.log(`ðŸ”” [IoT Event] ${method} unlock by ID #${id}: ${status}`);
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
        console.error("âŒ IoT Log error:", error);
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
            console.error("âŒ Terminal fetch error:", error);
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
        console.error("âŒ Get departments error:", error);
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
        console.error("âŒ Get users error:", error.message || error);
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
            console.log(`ðŸ“ [Biometric] Marking fingerprint as registered for ${eid}`);
            try {
                await supabase.from('fingerprints').upsert({
                    employee_id: eid,
                    template_data: 'ENROLLED_VIA_ADMIN_MOCK'
                }, { on_conflict: 'employee_id' });
            } catch (fpErr) {
                console.warn("âš ï¸ Fingerprint record upsert failed:", fpErr.message);
            }
        }

        // Apply employee update if there are valid fields
        let updatedUser = { ...existingUser, id };
        if (Object.keys(updates).length > 0) {
            console.log(`ðŸ“ [Update] Applying employee update for UUID ${id}...`);
            const { data, error } = await supabase
                .from('employees')
                .update(updates)
                .eq('id', id)
                .select('id, employee_id, name, email, role, department, status, image_url, created_at, updated_at, is_deleted, face_embedding')
                .single();

            if (error) {
                console.error("âŒ [Update] Employee update failed:", error.message);
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
            console.log(`ðŸ”„ [Cache] Evicting old biometric cache for ID: ${old_eid}`);
            try {
                await axios.delete(
                    `${PYTHON_ENGINE_URL}/api/biometrics/face/${encodeURIComponent(old_eid)}`,
                    { timeout: 3000 }
                );
            } catch (ce) {
                console.warn(`âš ï¸ [Cache] Old ID eviction skipped: ${ce.message}`);
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
        console.error("âŒ Update user error:", error.message || error);
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
            console.error("âŒ Supabase Upsert Error:", error);
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

        console.log("âœ… User created/updated in Supabase:", newUser.employee_id);
        res.status(201).json(newUser);
    } catch (error) {
        console.error("âŒ Create user error:", error);

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

        console.log(`ðŸ—‘ï¸ Initializing ${isHardDelete ? 'HARD' : 'soft'} delete for subject: ${id}`);

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
            console.log(`ðŸ§¨ PERMANENTLY DELETING employee ${employeeEid || id} and all history...`);
            
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
        console.log(`ðŸ”’ Marking employee ${employeeEid || id} as Deactivated...`);
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
            console.error("âŒ Failed to soft-delete employee record:", updateError);
            throw updateError;
        }

        // â”€â”€ Biometric Cache Eviction (MANDATORY for security) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // We MUST still remove them from the Python Engine's active RAM cache
        // otherwise they could still unlock the door until the next restart.
        const evictionEmployeeId = updatedUser.employee_id || employeeEid;
        console.log(`ðŸ§¹ Evicting biometric cache for deleted user: ${evictionEmployeeId}`);

        try {
            await axios.delete(
                `${PYTHON_ENGINE_URL}/api/biometrics/face/${encodeURIComponent(evictionEmployeeId)}`,
                { timeout: 5000 }
            );
            console.log(`âœ… Biometric cache evicted for ${evictionEmployeeId}`);
        } catch (cacheErr) {
            console.warn(`âš ï¸ Biometric engine offline during eviction: ${cacheErr.message}`);
        }

        try {
            await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/cache/rebuild`, {}, { timeout: 5000 });
            console.log('âœ… Biometric cache rebuild triggered');
        } catch (rebuildErr) {
            console.warn(`âš ï¸ Cache rebuild skipped (engine offline): ${rebuildErr.message}`);
        }

        console.log(`âœ… Success: Subject ${evictionEmployeeId} soft-deleted. Historical records preserved.`);
        res.json({
            success: true,
            message: "User has been deactivated and removed from the dashboard. Historical records are preserved.",
            employee_id: evictionEmployeeId
        });

    } catch (error) {
        console.error("âŒ Soft Delete Error:", error.message);
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
        console.log(`ðŸ“¸ Received biometric registration for: ${employeeId}`);

        if (!employeeId) {
            return res.status(400).json({ success: false, message: "Missing employeeId" });
        }

        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
            console.log("ðŸ“¦ Received registration photo as Multipart File");
        } else if (req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(base64Data, 'base64');
            console.log("ðŸ“¦ Received registration photo as Base64 String");
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

            console.log("ðŸ“¡ Forwarding to Biometric Engine...");
            const response = await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/face/register`, form, {
                headers: form.getHeaders(),
                timeout: 45000
            });

            if (response.data.success) {
                console.log(`âœ… Face successfully registered by AI Engine`);
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
            console.error("âŒ Biometric Engine error:", engineError.message);
            return res.status(503).json({
                success: false,
                message: "Biometric Engine error or offline.",
                details: engineError.message
            });
        }
    } catch (error) {
        console.error("âŒ Registration error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Biometric Health Proxy with Multi-Fallback Discovery
app.get('/api/biometrics/health', async (req, res) => {
    const fallbacks = [
        PYTHON_ENGINE_URL,
        'https://smart-door-edge-50851729985.asia-south1.run.app',
        'http://smart-door-edge:8001',
        'http://localhost:8001'
    ].filter(Boolean);

    for (const url of fallbacks) {
        try {
            console.log(`ðŸ” [Health Check] Trying: ${url}/health`);
            await axios.get(`${url}/health`, { timeout: 3000 });
            // If success, update the global URL if it was a fallback
            if (url !== PYTHON_ENGINE_URL) {
                console.log(`âœ… [Discovery] Updating PYTHON_ENGINE_URL to proven fallback: ${url}`);
                PYTHON_ENGINE_URL = url;
            }
            return res.json({ status: 'ready', engine: 'face-recognition', url });
        } catch (err) {
            console.warn(`âš ï¸ [Health Check] Failed for ${url}: ${err.message}`);
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
        console.log("ðŸ” [Verification] Checking face identity...");
        
        // Handle both Multipart (file) and JSON (Base64 image)
        let imageBuffer;
        if (req.file) {
            imageBuffer = req.file.buffer;
            console.log("ðŸ“¦ Received photo as Multipart File");
        } else if (req.body.image) {
            // Extract Base64 data (strip prefix if present)
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, "");
            imageBuffer = Buffer.from(base64Data, 'base64');
            console.log("ðŸ“¦ Received photo as Base64 String");
        }

        if (!imageBuffer) {
            console.error("âŒ No image data provided in request.");
            return res.status(400).json({ success: false, message: "No image data provided" });
        }

        // Fetch employees from Supabase
        const { data: employees, error } = await supabase
            .from('employees')
            .select('*')
            .eq('status', 'Active')
            .order('created_at', { ascending: false });

        if (error || !employees || employees.length === 0) {
            console.warn("ðŸš« Access Denied: No employees registered in database.");
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

            console.log(`ðŸ“¡ Attempting Biometric Engine (${PYTHON_ENGINE_URL})...`);

            // --- WAIT FOR ENGINE READY (max 60s) ---
            let engineReady = false;
            for (let attempt = 0; attempt < 12; attempt++) {
                try {
                    await axios.get(`${PYTHON_ENGINE_URL}/health`, { timeout: 5000 });
                    engineReady = true;
                    break;
                } catch (_) {
                    console.log(`â³ Biometric engine not ready yet, waiting... (attempt ${attempt + 1}/12)`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }

            if (!engineReady) {
                console.error("âŒ Biometric engine did not become ready in time.");
                return res.status(503).json({
                    success: false,
                    message: "Biometric Service is still starting up. Please wait 30 seconds and try again."
                });
            }

            const response = await axios.post(`${PYTHON_ENGINE_URL}/api/biometrics/face/verify`, form, {
                headers: form.getHeaders(),
                timeout: 120000 // 120s â€” Render Free/Starter tiers can be slow on first Cold-Start
            });

            if (response.data.success) {
                const employeeId = response.data.employee_id;
                console.log(`âœ… Face Verified: ${employeeId}`);



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
                console.warn(`âš ï¸ Ambiguous Match for hint: ${response.data.id_hint}. Requesting Fingerprint fallback.`);

                try {
                    await supabase.from('access_logs').insert({
                        employee_id: response.data.id_hint,
                        status: 'ambiguous',
                        device_id: 'terminal_01',
                        method: 'face'
                    });
                } catch (logError) {
                    console.error("âš ï¸ Failed to record ambiguous access log:", logError.message);
                }

                return res.status(403).json({
                    success: false,
                    error_code: "MFA_REQUIRED",
                    message: "Ambiguous matching. Please use Fingerprint sensor for secondary verification.",
                    id_hint: response.data.id_hint
                });
            } else {
                console.log(`ðŸš« Engine Rejection: ${response.data.message}`);
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
                } catch (le) { console.error('âš ï¸ Failed to log rejection:', le.message); }
                return res.status(401).json({
                    success: false,
                    message: response.data.message || "Access Denied."
                });
            }
        } catch (engineError) {
            console.error("âŒ Biometric Engine error/offline:", engineError.message);
            // Log engine offline as failed
            try {
                await supabase.from('access_logs').insert({
                    employee_id: null,
                    status: 'failed',
                    device_id: 'terminal_01',
                    method: 'face',
                    metadata: { reason: 'Biometric engine offline', error: engineError.message }
                });
            } catch (le) { console.error('âš ï¸ Failed to log engine-offline event:', le.message); }
            return res.status(503).json({
                success: false,
                message: "Biometric Service Unavailable. Please use manual override or contact admin."
            });
        }

    } catch (error) {
        console.error("âŒ Verification error:", error);
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

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Backend running on http://localhost:${PORT}`);
    });
}

module.exports = app;
