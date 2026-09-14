/**
 * Leave register + holidays (admin only).
 *
 *   GET    /api/leaves?from=YYYY-MM-DD&to=YYYY-MM-DD   leaves in a range, with the employee
 *   POST   /api/leaves     { employee_id (EMP-### or uuid), date, type, note }  upsert (one per person per day)
 *   POST   /api/leaves/range  { employee_id, from, to, type, note }  same, for 2+ days in a row —
 *          Sundays and holidays inside the range are skipped automatically (the same rule the
 *          monthly report already uses to count absence), so a leave never lands on a non-working day.
 *   PATCH  /api/leaves/:id  { status: 'Pending' | 'Approved' }  approve (or unapprove) one leave day
 *   DELETE /api/leaves/:id
 *   GET    /api/holidays?year=2026
 *   POST   /api/holidays   { date, name }
 *   DELETE /api/holidays/:date
 *   GET    /api/leaves/types
 *
 * A leave starts life as 'Pending' and the admin approves it from the panel (a group of
 * consecutive days is approved together). Approval is a tracking flag only — a Pending leave
 * still counts as taken in the monthly report and CL balance, same as an Approved one, so a
 * forgotten approval never distorts payroll.
 *
 * Tables come from supabase/migration_v8_leaves.sql, and the status column from
 * migration_v10_leave_status.sql (the user runs each once in the Supabase SQL editor).
 * Until then every route answers 503 with that hint.
 */
const express = require('express');
const supabase = require('../../supabase');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { LEAVE_TYPES, isValidLeaveType, isValidDate, workingDates } = require('../lib/leaves');

const router = express.Router();
const LEAVE_STATUSES = ['Pending', 'Approved'];
const SETUP_HINT = 'Leave register is not fully set up yet: run supabase/migration_v8_leaves.sql, then migration_v10_leave_status.sql, in the Supabase SQL editor.';
const missingTable = (err) => /Could not find the table|does not exist|schema cache/i.test(err?.message || '');
const fail = (res, err, what) => {
    if (missingTable(err)) return res.status(503).json({ error: SETUP_HINT });
    console.error(`[Leaves] ${what}:`, err?.message);
    return res.status(500).json({ error: `Could not ${what}` });
};

async function resolveEmployee(idOrUuid) {
    const v = String(idOrUuid || '').trim();
    if (!v) return null;
    const isUuid = /^[0-9a-f-]{36}$/i.test(v);
    const q = supabase.from('employees').select('id, employee_id, name, department').eq('is_deleted', false);
    const { data } = isUuid ? await q.eq('id', v).maybeSingle() : await q.ilike('employee_id', v).maybeSingle();
    return data || null;
}

router.get('/api/leaves/types', authenticateToken, (req, res) => res.json({ types: LEAVE_TYPES }));

router.get('/api/leaves', authenticateToken, isAdmin, async (req, res) => {
    const { from, to, employee_id } = req.query;
    if (!isValidDate(from) || !isValidDate(to)) return res.status(400).json({ error: 'from and to (YYYY-MM-DD) are required' });
    try {
        let q = supabase.from('leaves').select('id, date, type, note, status, created_by, created_at, employees!inner(id, employee_id, name, department)')
            .gte('date', from).lte('date', to).order('date', { ascending: false });
        if (employee_id) q = q.eq('employees.employee_id', String(employee_id).toUpperCase());
        const { data, error } = await q;
        if (error) throw error;
        res.json({ from, to, leaves: (data || []).map(l => ({ id: l.id, date: l.date, type: l.type, note: l.note, status: l.status || 'Approved', created_by: l.created_by, created_at: l.created_at, employee: l.employees })) });
    } catch (err) { fail(res, err, 'load leaves'); }
});

router.post('/api/leaves', authenticateToken, isAdmin, async (req, res) => {
    const { employee_id, date, type, note } = req.body || {};
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!isValidLeaveType(type)) return res.status(400).json({ error: `type must be one of ${Object.keys(LEAVE_TYPES).join(', ')}` });
    try {
        const emp = await resolveEmployee(employee_id);
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        const row = { employee_id: emp.id, date, type: String(type).toUpperCase(), note: String(note || '').trim().slice(0, 200) || null, status: 'Pending', created_by: req.user?.email || 'admin' };
        const { data, error } = await supabase.from('leaves').upsert(row, { onConflict: 'employee_id,date' }).select('id, date, type, note, status, created_by, created_at').single();
        if (error) throw error;
        res.status(201).json({ leave: { ...data, employee: emp } });
    } catch (err) { fail(res, err, 'save leave'); }
});

// One employee, 2+ days off in a row (e.g. a 4-day trip home): mark every WORKING day in
// [from, to] with the same type/note in one call. Sundays and company holidays inside the
// range are skipped, never written as a leave, and reported back so the admin can see them.
router.post('/api/leaves/range', authenticateToken, isAdmin, async (req, res) => {
    const { employee_id, from, to, type, note } = req.body || {};
    if (!isValidDate(from) || !isValidDate(to)) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
    if (to < from) return res.status(400).json({ error: '"to" must be on or after "from"' });
    if (!isValidLeaveType(type)) return res.status(400).json({ error: `type must be one of ${Object.keys(LEAVE_TYPES).join(', ')}` });
    const spanDays = (new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000 + 1;
    if (spanDays > 62) return res.status(400).json({ error: 'Range is too long (max ~2 months); split it into smaller ranges.' });
    try {
        const emp = await resolveEmployee(employee_id);
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        const { data: holidayRows, error: hErr } = await supabase.from('holidays').select('date, name').gte('date', from).lte('date', to);
        if (hErr) throw hErr;
        const holidayByDate = new Map((holidayRows || []).map(h => [h.date, h.name]));
        const working = workingDates(from, to, holidayRows || []);

        const skipped = [];
        const cursor = new Date(from + 'T00:00:00Z');
        const end = new Date(to + 'T00:00:00Z');
        while (cursor <= end) {
            const iso = cursor.toISOString().slice(0, 10);
            if (!working.has(iso)) skipped.push({ date: iso, reason: holidayByDate.has(iso) ? `holiday (${holidayByDate.get(iso)})` : 'Sunday' });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        if (working.size === 0) return res.status(400).json({ error: 'Every day in that range is a Sunday or a holiday — nothing to mark.' });

        const upType = String(type).toUpperCase();
        const trimmedNote = String(note || '').trim().slice(0, 200) || null;
        const createdBy = req.user?.email || 'admin';
        const rows = [...working].sort().map(date => ({ employee_id: emp.id, date, type: upType, note: trimmedNote, status: 'Pending', created_by: createdBy }));
        const { data, error } = await supabase.from('leaves').upsert(rows, { onConflict: 'employee_id,date' }).select('id, date, type, note, status, created_by, created_at');
        if (error) throw error;
        res.status(201).json({
            employee: emp,
            leaves: (data || []).map(l => ({ ...l, employee: emp })),
            created: (data || []).length,
            skipped,
        });
    } catch (err) { fail(res, err, 'save leave range'); }
});

router.patch('/api/leaves/:id', authenticateToken, isAdmin, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const status = String(req.body?.status || '');
    if (!LEAVE_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${LEAVE_STATUSES.join(', ')}` });
    try {
        const { data, error } = await supabase.from('leaves').update({ status }).eq('id', req.params.id).select('id, date, type, note, status, created_by, created_at').maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Leave not found' });
        res.json({ leave: data });
    } catch (err) { fail(res, err, 'update leave status'); }
});

router.delete('/api/leaves/:id', authenticateToken, isAdmin, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const { error } = await supabase.from('leaves').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ deleted: req.params.id });
    } catch (err) { fail(res, err, 'delete leave'); }
});

// CL ledger for one month: { month, rows: [{ employee_id (uuid), opening_cl, added_cl, used_cl, closing_cl, source }] }
router.get('/api/leave-ledger', authenticateToken, isAdmin, async (req, res) => {
    const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.month || ''));
    if (!m) return res.status(400).json({ error: 'month must be YYYY-MM' });
    const month = `${m[1]}-${m[2]}-01`;
    try {
        const { data, error } = await supabase.from('leave_ledger').select('id, employee_id, month, opening_cl, added_cl, used_cl, closing_cl, source, note').eq('month', month);
        if (error) throw error;
        res.json({ month, rows: data || [] });
    } catch (err) { fail(res, err, 'load leave ledger'); }
});

router.get('/api/holidays', authenticateToken, async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    try {
        const { data, error } = await supabase.from('holidays').select('date, name').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`).order('date');
        if (error) throw error;
        res.json({ year, holidays: data || [] });
    } catch (err) { fail(res, err, 'load holidays'); }
});

router.post('/api/holidays', authenticateToken, isAdmin, async (req, res) => {
    const { date, name } = req.body || {};
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!String(name || '').trim()) return res.status(400).json({ error: 'name is required' });
    try {
        const { data, error } = await supabase.from('holidays').upsert({ date, name: String(name).trim().slice(0, 100) }, { onConflict: 'date' }).select('date, name').single();
        if (error) throw error;
        res.status(201).json({ holiday: data });
    } catch (err) { fail(res, err, 'save holiday'); }
});

router.delete('/api/holidays/:date', authenticateToken, isAdmin, async (req, res) => {
    if (!isValidDate(req.params.date)) return res.status(400).json({ error: 'Invalid date' });
    try {
        const { error } = await supabase.from('holidays').delete().eq('date', req.params.date);
        if (error) throw error;
        res.json({ deleted: req.params.date });
    } catch (err) { fail(res, err, 'delete holiday'); }
});

/** Helpers for the monthly report and the daily absent list (tables may not exist yet -> empty). */
async function leavesBetween(from, to) {
    try {
        const { data, error } = await supabase.from('leaves').select('employee_id, date, type').gte('date', from).lte('date', to);
        if (error) throw error;
        return data || [];
    } catch (err) { if (!missingTable(err)) console.warn('[Leaves] read failed:', err.message); return []; }
}
/** Monthly CL ledger rows (first-of-month dates) between two months; missing table -> []. */
async function ledgerBetween(fromMonth, toMonth) {
    try {
        const { data, error } = await supabase.from('leave_ledger').select('employee_id, month, opening_cl, added_cl, used_cl, closing_cl, source').gte('month', fromMonth).lte('month', toMonth);
        if (error) throw error;
        return data || [];
    } catch (err) { if (!missingTable(err)) console.warn('[Ledger] read failed:', err.message); return []; }
}

async function holidaysBetween(from, to) {
    try {
        const { data, error } = await supabase.from('holidays').select('date, name').gte('date', from).lte('date', to);
        if (error) throw error;
        return data || [];
    } catch (err) { if (!missingTable(err)) console.warn('[Holidays] read failed:', err.message); return []; }
}

module.exports = router;
module.exports.leavesBetween = leavesBetween;
module.exports.ledgerBetween = ledgerBetween;
module.exports.holidaysBetween = holidaysBetween;
