/**
 * Absence notices (Englabs staff, absent without approved leave). Nothing is sent automatically:
 * an admin reviews the list and clicks Send per person.
 *
 *   GET  /api/absence-notices?date=YYYY-MM-DD    candidates + held-back pending leaves (default: yesterday)
 *   POST /api/absence-notices/send { employee_id, date }   emails that one person the notice
 */
const express = require('express');
const adminDb = require('../lib/adminDb');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { istDateString } = require('../lib/attendanceTime');
const { isValidDate } = require('../lib/leaves');
const { formatAbsenceNoticeEmail } = require('../lib/alerts');
const { buildAbsenceCandidates, FINE_INR } = require('../lib/absence');
const { loadDay } = require('../lib/dayData');
const { logAudit } = require('../lib/audit');
const mailer = require('../lib/mailer');

const router = express.Router();
const yesterday = () => istDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));
const key = (employeeId, date) => `${employeeId}:${date}`;

async function alreadySent(date, ids) {
    if (ids.length === 0) return new Set();
    try {
        const { data, error } = await adminDb.from('audit_log').select('entity_id').eq('action', 'absence.notice').in('entity_id', ids.map(i => key(i, date)));
        if (error) return new Set();
        return new Set((data || []).map(r => r.entity_id));
    } catch { return new Set(); }
}

router.get('/api/absence-notices', authenticateToken, isAdmin, async (req, res) => {
    const date = req.query.date || yesterday();
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    try {
        const result = buildAbsenceCandidates({ date, ...(await loadDay(date)) });
        const sent = await alreadySent(date, result.notices.map(n => n.employee_id));
        res.json({ ...result, fineInr: FINE_INR, notices: result.notices.map(n => ({ ...n, alreadySent: sent.has(key(n.employee_id, date)) })) });
    } catch (err) {
        console.error('[Absence] list failed:', err.message);
        res.status(500).json({ error: 'Could not load the absence list' });
    }
});

router.post('/api/absence-notices/send', authenticateToken, isAdmin, async (req, res) => {
    const { employee_id: employeeId, date } = req.body || {};
    if (!employeeId || !isValidDate(date)) return res.status(400).json({ error: 'employee_id and date (YYYY-MM-DD) are required' });
    try {
        // Re-check on the server: only someone who is still a candidate for that day can be noticed.
        const result = buildAbsenceCandidates({ date, ...(await loadDay(date)) });
        const person = result.notices.find(n => n.employee_id === employeeId);
        if (!person) return res.status(409).json({ error: 'This person is not on the absence list for that day (they may have checked in, or have leave on record).' });
        if (!person.emailable) return res.status(422).json({ error: 'No valid email is on record for this person (or their email updates are off). Tell them in person.' });
        if ((await alreadySent(date, [employeeId])).has(key(employeeId, date))) return res.status(409).json({ error: 'A notice for this day was already sent to this person.' });
        if (!mailer.config().configured) return res.status(503).json({ error: 'Email is not configured on the server.' });

        await mailer.sendMail({ ...formatAbsenceNoticeEmail({ name: person.name, date, amount: FINE_INR }), to: person.email });
        logAudit(req, { action: 'absence.notice', entityType: 'absence', entityId: key(employeeId, date), entityLabel: `${person.name} (${employeeId})`, changes: { notice: { from: null, to: `Rs. ${FINE_INR} fine notice for ${date}` } } });
        res.json({ sent: true, employee_id: employeeId, date, email: person.email });
    } catch (err) {
        console.error('[Absence] send failed:', err.message);
        res.status(500).json({ error: 'Could not send the notice' });
    }
});

module.exports = router;
