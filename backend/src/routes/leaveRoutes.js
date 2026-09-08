/**
 * Leave register + holidays (admin only).
 *
 *   GET    /api/leaves?from=YYYY-MM-DD&to=YYYY-MM-DD   leaves in a range, with the employee
 *   POST   /api/leaves     { employee_id (EMP-### or uuid), date, type, note }  upsert (one per person per day)
 *   DELETE /api/leaves/:id
 *   GET    /api/holidays?year=2026
 *   POST   /api/holidays   { date, name }
 *   DELETE /api/holidays/:date
 *   GET    /api/leaves/types
 *
 * Tables come from supabase/migration_v8_leaves.sql (the user runs it in the
 * Supabase SQL editor). Until then every route answers 503 with that hint.
 */
const express = require('express');
const supabase = require('../../supabase');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { LEAVE_TYPES, isValidLeaveType, isValidDate } = require('../lib/leaves');

const router = express.Router();
const SETUP_HINT = 'Leave register is not set up yet: run supabase/migration_v8_leaves.sql in the Supabase SQL editor.';
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
        let q = supabase.from('leaves').select('id, date, type, note, created_by, created_at, employees!inner(id, employee_id, name, department)')
            .gte('date', from).lte('date', to).order('date', { ascending: false });
        if (employee_id) q = q.eq('employees.employee_id', String(employee_id).toUpperCase());
        const { data, error } = await q;
        if (error) throw error;
        res.json({ from, to, leaves: (data || []).map(l => ({ id: l.id, date: l.date, type: l.type, note: l.note, created_by: l.created_by, created_at: l.created_at, employee: l.employees })) });
    } catch (err) { fail(res, err, 'load leaves'); }
});

router.post('/api/leaves', authenticateToken, isAdmin, async (req, res) => {
    const { employee_id, date, type, note } = req.body || {};
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    if (!isValidLeaveType(type)) return res.status(400).json({ error: `type must be one of ${Object.keys(LEAVE_TYPES).join(', ')}` });
    try {
        const emp = await resolveEmployee(employee_id);
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        const row = { employee_id: emp.id, date, type: String(type).toUpperCase(), note: String(note || '').trim().slice(0, 200) || null, created_by: req.user?.email || 'admin' };
        const { data, error } = await supabase.from('leaves').upsert(row, { onConflict: 'employee_id,date' }).select('id, date, type, note, created_by, created_at').single();
        if (error) throw error;
        res.status(201).json({ leave: { ...data, employee: emp } });
    } catch (err) { fail(res, err, 'save leave'); }
});

router.delete('/api/leaves/:id', authenticateToken, isAdmin, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    try {
        const { error } = await supabase.from('leaves').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ deleted: req.params.id });
    } catch (err) { fail(res, err, 'delete leave'); }
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
async function holidaysBetween(from, to) {
    try {
        const { data, error } = await supabase.from('holidays').select('date, name').gte('date', from).lte('date', to);
        if (error) throw error;
        return data || [];
    } catch (err) { if (!missingTable(err)) console.warn('[Holidays] read failed:', err.message); return []; }
}

module.exports = router;
module.exports.leavesBetween = leavesBetween;
module.exports.holidaysBetween = holidaysBetween;
