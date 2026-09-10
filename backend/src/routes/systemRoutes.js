/**
 * GET /api/system/info (admin): the configuration the system is really running
 * with, for the Settings page. Read-only; nothing here is editable over HTTP.
 */
const express = require('express');
const supabase = require('../../supabase');
const { authenticateToken, isAdmin } = require('../middleware/auth');
const geocode = require('../../services/geocode');
const { DEFAULT_WEEKEND } = require('../lib/leaves');

const STARTED_AT = new Date().toISOString();
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

module.exports = function systemRoutes({ engineHttp, engineUrl }) {
    const router = express.Router();
    router.get('/api/system/info', authenticateToken, isAdmin, async (req, res) => {
        const year = new Date().getFullYear();
        const [engine, holidays, leaves] = await Promise.all([
            engineHttp.get(`${engineUrl}/health`, { timeout: 15000 }).then(r => r.data).catch(e => ({ status: 'unreachable', error: e.message })),
            supabase.from('holidays').select('date', { count: 'exact', head: true }).gte('date', `${year}-01-01`).lte('date', `${year}-12-31`).then(r => (r.error ? null : r.count || 0)).catch(() => null),
            supabase.from('leaves').select('id', { count: 'exact', head: true }).then(r => (r.error ? 'missing' : 'ready')).catch(() => 'missing'),
        ]);
        res.json({
            engine: { status: engine.status, faces: engine.faces, threshold: engine.threshold, ambiguity_gap: engine.ambiguity_gap, model: engine.model },
            engine_url: engineUrl,
            ambiguity_frames: Number(process.env.AMBIGUITY_FRAMES) || 3,
            late_after: '09:15 IST',
            weekend: DEFAULT_WEEKEND.map(d => DAY_NAMES[d]).join(', '),
            year,
            holidays_count: holidays,
            leave_register: leaves,
            known_places: geocode.parseKnownPlaces(process.env.KNOWN_PLACES),
            photo_retention_days: Number(process.env.ATTENDANCE_PHOTO_RETENTION_DAYS) || 90,
            backend_revision: process.env.K_REVISION || 'local',
            node: process.version,
            started_at: STARTED_AT,
            admin_email: process.env.ADMIN_EMAIL || null,
            login_attempts_per_15_min: Number(process.env.LOGIN_ATTEMPTS_PER_15_MIN) || 10,
        });
    });
    return router;
};
