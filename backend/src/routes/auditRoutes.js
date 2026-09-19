/**
 * GET /api/audit-log?limit=100&entity_type=employee&q=text   (admin only)
 * Newest first. Table comes from supabase/migration_v20_audit_log.sql; until it is run the
 * route answers 503 with that hint (same pattern as the leave register).
 */
const express = require('express');
const supabase = require('../lib/adminDb');
const { authenticateToken, isAdmin } = require('../middleware/auth');

const router = express.Router();
const SETUP_HINT = 'Audit trail is not set up yet: run supabase/migration_v20_audit_log.sql in the Supabase SQL editor.';

router.get('/api/audit-log', authenticateToken, isAdmin, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    try {
        let q = supabase.from('audit_log').select('id, created_at, actor, action, entity_type, entity_id, entity_label, changes')
            .order('created_at', { ascending: false }).limit(limit);
        if (req.query.entity_type) q = q.eq('entity_type', String(req.query.entity_type));
        if (req.query.q) {
            const term = String(req.query.q).replace(/[%,()]/g, ' ').trim();
            if (term) q = q.or(`entity_label.ilike.%${term}%,actor.ilike.%${term}%,action.ilike.%${term}%`);
        }
        const { data, error } = await q;
        if (error) {
            if (/Could not find the table|does not exist|schema cache/i.test(error.message || '')) return res.status(503).json({ error: SETUP_HINT });
            throw error;
        }
        res.json({ entries: data || [] });
    } catch (err) {
        console.error('[Audit] read failed:', err.message);
        res.status(500).json({ error: 'Could not load the audit trail' });
    }
});

module.exports = router;
