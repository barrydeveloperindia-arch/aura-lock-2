const supabase = require('../../supabase');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const attendancePhotos = require('../../services/attendancePhotos');

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

                const { data: inserted, error: insError } = await supabase.from('attendance').insert({
                    employee_id: actualUuid,
                    date: today,
                    check_in: checkInIso,
                    method: mappedMethod,
                    device_id: deviceId,
                    status: arrivalStatus
                    // REMOVED 'remarks' as it is missing from schema
                }).select('id').single();
                if (insError) throw new Error(insError.message);

                return {
                    message: "Check-in recorded",
                    event: 'check_in',
                    attendance_id: inserted?.id || null,
                    date: today,
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
                    event: 'duplicate',
                    attendance_id: existing.id,
                    date: existing.date,
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
                event: 'check_out',
                attendance_id: existing.id,
                date: existing.date,
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
exports.recordAttendance = recordAttendance;

/**
 * Store the captured frame for a check-in / check-out event.
 * Never throws; returns { kind, saved } for the API response, or null.
 */
const attachAttendancePhoto = async (attendanceResult, frameBuffer, meta = {}) => {
    if (!frameBuffer || !attendanceResult) return null;
    const kind = attendanceResult.event === 'check_in' ? 'in'
        : attendanceResult.event === 'check_out' ? 'out'
        : null;
    if (!kind || !attendanceResult.attendance_id) return null;
    const capturedAt = kind === 'in' ? attendanceResult.check_in : attendanceResult.check_out;
    // Refresh the employee's dashboard avatar from the raw (unstamped) frame
    if (meta.employee_id) {
        await attendancePhotos.saveEmployeeAvatar(meta.employee_id, frameBuffer);
    }
    const saved = await attendancePhotos.saveAttendancePhoto({
        buffer: frameBuffer,
        attendanceId: attendanceResult.attendance_id,
        date: attendanceResult.date,
        kind,
        // Burn name / id / IN-OUT / server date-time (+ terminal GPS if sent) into the frame
        stamp: { name: meta.name, employeeId: meta.employee_id, capturedAt, location: meta.location, locationSource: meta.locationSource },
    });
    return { kind, saved: !!saved, stamped_at: capturedAt, location: attendancePhotos.normalizeLocation(meta.location) };
};

/** Pull an optional terminal GPS fix out of a multipart/JSON body. */
const locationFromBody = (body = {}) => attendancePhotos.normalizeLocation({
    lat: body.lat, lng: body.lng, accuracy: body.accuracy, fix_time: body.fix_time,
});
exports.locationFromBody = locationFromBody;
exports.attachAttendancePhoto = attachAttendancePhoto;

// Signed URL (1 hour) for the check-in ("in") or check-out ("out") frame of one attendance row.
exports.getAttendancePhoto = async (req, res) => {
    try {
        const { id, kind } = req.params;
        if (!attendancePhotos.isValidAttendanceId(id) || !attendancePhotos.isValidKind(kind)) {
            return res.status(400).json({ error: 'Invalid attendance id or photo kind' });
        }
        const { data: row, error } = await supabase
            .from('attendance')
            .select('id, date, check_in, check_out, employees(name, employee_id, department)')
            .eq('id', id)
            .single();
        if (error || !row) return res.status(404).json({ error: 'Attendance record not found' });

        const [signed, sidecar] = await Promise.all([
            attendancePhotos.getSignedPhotoUrl({ date: row.date, attendanceId: row.id, kind }),
            attendancePhotos.getPhotoLocation({ date: row.date, attendanceId: row.id, kind }),
        ]);
        if (!signed) return res.status(404).json({ error: 'No photo stored for this event' });

        res.json({
            ...signed,
            kind,
            captured_at: kind === 'in' ? row.check_in : row.check_out,
            date: row.date,
            employee: row.employees || null,
            // Terminal GPS fix at the moment of the scan (null if the tablet had no fix)
            location: sidecar?.location || null,
            location_source: sidecar?.source || null,
        });
    } catch (error) {
        console.error('❌ Attendance photo error:', error.message);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

// Signed avatar URLs (1 hour) for a list of employee ids: ?ids=EMP-001,EMP-002
exports.getEmployeeAvatars = async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 500);
    const urls = await attendancePhotos.getAvatarUrls(ids);
    res.json({ avatars: urls, expires_in: 3600 });
};

// Manual retention sweep (also runs daily in-process). Admin only.
exports.cleanupAttendancePhotos = async (req, res) => {
    const days = parseInt(req.body?.retention_days, 10) || attendancePhotos.RETENTION_DAYS;
    const summary = await attendancePhotos.cleanupExpiredPhotos(days);
    res.json({ retention_days: days, ...summary });
};

// Dedicated Attendance Marking Endpoint
// Handles both internal and external (biometric engine) calls.
// Accepts JSON, or multipart with an optional `file` (JPEG frame) for non-face terminals.
exports.markAttendance = async (req, res) => {
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

        let empMeta = {};
        if (!uuidRegex.test(targetId)) {
            const { data: emp, error: empErr } = await supabase
                .from('employees')
                .select('id, name, employee_id')
                .eq('employee_id', targetId)
                .single();

            if (empErr || !emp) {
                console.error(`❌ [Attendance Mark] Could not resolve ID: ${targetId}`);
                return res.status(404).json({ error: "Employee not found or ID invalid" });
            }
            finalUuid = emp.id;
            empMeta = { name: emp.name, employee_id: emp.employee_id };
        } else if (req.file) {
            const { data: emp } = await supabase.from('employees').select('name, employee_id').eq('id', targetId).single();
            if (emp) empMeta = { name: emp.name, employee_id: emp.employee_id };
        }

        // 2. Record Attendance
        const attendanceResult = await recordAttendance(finalUuid, method || 'face', device_id || 'api_call');

        // 3. Optional photo (multipart `file`) for fingerprint / RFID terminals
        const photo = await attachAttendancePhoto(attendanceResult, req.file?.buffer, { ...empMeta, location: locationFromBody(req.body) });

        res.json({ ...attendanceResult, photo });
    } catch (error) {
        console.error("❌ [Attendance Mark] Critical Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};



// ─── Employee Attendance History Endpoint ───────────────────────────────────
exports.getEmployeeHistory = async (req, res) => {
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
                .select('id, name, department, employee_id, email, role, status, image_url, created_at')
                .eq('employee_id', employee_id)
                .single();

            if (empErr || !emp) return res.status(404).json({ error: "Employee not found" });
            finalUuid = emp.id;
            employeeData = emp;
        } else {
            const { data: emp, error: empErr } = await supabase
                .from('employees')
                .select('id, name, department, employee_id, email, role, status, image_url, created_at')
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

        // Photos for this page + the employee's latest-scan avatar, two batch calls
        const [availability, avatarUrls] = await Promise.all([
            attendancePhotos.listPhotoAvailability(paginatedData.map(r => r.date)),
            attendancePhotos.getAvatarUrls([employeeData.employee_id]),
        ]);
        const signed = await attendancePhotos.getSignedPhotoUrlsForRows(paginatedData, availability);
        const rows = paginatedData.map(r => ({
            ...r,
            photos: availability.get(r.id) || { in: false, out: false },
            photo_urls: signed.get(r.id) || { in: null, out: null },
        }));

        res.json({
            employee: { ...employeeData, avatar_url: avatarUrls[employeeData.employee_id] || null },
            data: rows,
            total: deduplicated.length,
            page: parseInt(page, 10),
            limit: pgLimit
        });
    } catch (error) {
        console.error('❌ Get employee attendance error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ─── Employee Attendance Summary Endpoint ───────────────────────────────────
exports.getEmployeeSummary = async (req, res) => {
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
};

// ─── Attendance Listing Endpoint ────────────────────────────────────────────
// Supports: date range, employee_id, department, name search, pagination, sorting
exports.getAttendanceList = async (req, res) => {
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

        // Attach photo availability ({in, out}) per row without touching the schema
        const availability = await attendancePhotos.listPhotoAvailability(paginatedData.map(r => r.date));
        // One batch signing call for the page so rows can show IN / OUT thumbnails inline
        const signed = await attendancePhotos.getSignedPhotoUrlsForRows(paginatedData, availability);
        const withPhotos = paginatedData.map(r => ({
            ...r,
            photos: availability.get(r.id) || { in: false, out: false },
            photo_urls: signed.get(r.id) || { in: null, out: null },
        }));

        res.json({ data: withPhotos, total: deduplicated.length });
    } catch (error) {
        console.error('❌ Get attendance error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
};

exports.exportExcelEmployee = async (req, res) => {
    const resolved = await resolveEmployeeUuid(req.params.employee_id);
    if (!resolved) return res.status(404).json({ error: "Employee not found" });
    req.query.employee_id = resolved;
    return handleExcelExport(req, res);
};

// ─── Employee PDF Export ────────────────────────────────────────────────────
exports.exportPdfEmployee = async (req, res) => {
    const resolved = await resolveEmployeeUuid(req.params.employee_id);
    if (!resolved) return res.status(404).json({ error: "Employee not found" });
    req.query.employee_id = resolved;
    return handlePdfExport(req, res);
};

// Helper to resolve employee UUID for exports
exports.resolveEmployeeUuid = resolveEmployeeUuid;
async function resolveEmployeeUuid(idOrEid) {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (uuidRegex.test(idOrEid)) return idOrEid;
    const { data } = await supabase.from('employees').select('id').eq('employee_id', idOrEid).single();
    return data ? data.id : null;
}

// Helper to resolve human-readable employee_id (e.g. EMP-0001)
exports.resolveEmployeeEid = resolveEmployeeEid;
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

exports.exportExcel = handleExcelExport;


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


exports.exportPdf = handlePdfExport;


// Attendance Report Endpoint (Last 7 Days)
exports.getReport = async (req, res) => {
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
};

// Monthly Attendance Report Endpoint
exports.getMonthlyReport = async (req, res) => {
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
};

// Attendance Analytics Endpoint
exports.getAnalytics = async (req, res) => {
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
};

// Activity Trend Endpoint (24h)
exports.getActivity = async (req, res) => {
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
};

exports.recordAttendance = recordAttendance;

