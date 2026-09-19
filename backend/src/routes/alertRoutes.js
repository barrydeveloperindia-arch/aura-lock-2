/**
 * Daily attendance alert by email.
 *
 *   GET  /api/alerts/config                admin: is email configured, who gets it, when it runs
 *   POST /api/alerts/daily[?dry=1&date=YYYY-MM-DD]
 *        admin (JWT)  or  Cloud Scheduler (header x-alert-key = ALERT_CRON_KEY)
 *        dry=1 returns the summary + email preview without sending.
 *
 * Runs 09:45 IST Mon-Sat from Cloud Scheduler; Sundays and holidays are skipped by the summary rules.
 */
const crypto = require('crypto');
const express = require('express');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { istDateString, istClock } = require('../lib/attendanceTime');
const { isValidDate } = require('../lib/leaves');
const { buildDailySummary, formatEmail, formatLateStaffEmail, lateRecipients } = require('../lib/alerts');
const mailer = require('../lib/mailer');
const { loadDay } = require('../lib/dayData');

const router = express.Router();
const SCHEDULE_TEXT = '09:45 IST, Monday to Saturday (Sundays and holidays skipped)';

function safeEqual(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function allow(req, res, next) {
    const key = process.env.ALERT_CRON_KEY;
    if (key && req.headers['x-alert-key'] && safeEqual(req.headers['x-alert-key'], key)) return next();
    return authenticateToken(req, res, () => isAdmin(req, res, next));
}

router.get('/api/alerts/config', authenticateToken, isAdmin, (req, res) => {
    const c = mailer.config();
    res.json({ email: { configured: c.configured, recipients: c.to }, schedule: SCHEDULE_TEXT, cronKeySet: Boolean(process.env.ALERT_CRON_KEY) });
});

router.post('/api/alerts/daily', allow, async (req, res) => {
    const date = req.query.date || istDateString();
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const dry = req.query.dry === '1' || req.query.dry === 'true';
    try {
        const summary = buildDailySummary({ date, ...(await loadDay(date)) });
        if (summary.skip) return res.json({ sent: false, skipped: summary.reason, date });
        const email = formatEmail(summary, istClock(new Date()));
        const counts = { present: summary.present.length, late: summary.late.length, notIn: summary.absent.length, onLeave: summary.onLeave.length, staff: summary.total };
        const personal = lateRecipients(summary);
        const personalPreview = personal.map(p => ({ employee_id: p.employee_id, name: p.name, email: p.email, time: p.time }));
        if (dry) return res.json({ sent: false, dry: true, date, counts, subject: email.subject, text: email.text, personal: personalPreview });
        const r = await mailer.sendMail(email);
        console.log(`[Alerts] daily email sent for ${date} to ${r.recipients} recipient(s)`);
        // One failed personal email must not stop the others or fail the run.
        const personalResult = { sent: 0, failed: [] };
        for (const p of personal) {
            try { await mailer.sendMail({ ...formatLateStaffEmail(p, date), to: p.email }); personalResult.sent++; }
            catch (e) { console.warn(`[Alerts] late email to ${p.employee_id} failed: ${e.message}`); personalResult.failed.push(p.employee_id); }
        }
        res.json({ sent: true, date, counts, recipients: r.recipients, personal: personalResult });
    } catch (err) {
        console.error('[Alerts] daily alert failed:', err.message);
        const notConfigured = /not configured/.test(err.message);
        res.status(notConfigured ? 503 : 500).json({ error: notConfigured ? err.message : 'Could not send the daily alert' });
    }
});

module.exports = router;
