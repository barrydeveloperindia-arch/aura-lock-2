/**
 * Face-threshold calibration ("measure mode").
 *
 * POST   /api/biometrics/face/measure          admin, multipart frame + claimed_id / claimed_name / condition / session
 *        -> engine distance to every enrolled face; nothing is logged, no attendance, no unlock.
 *        The labelled measurement is appended to storage: attendance-photos/calibration/<session>.json
 * GET    /api/biometrics/face/measure/report   admin, ?session=YYYY-MM-DD  -> rows + report (see lib/calibration)
 * DELETE /api/biometrics/face/measure/last     admin, ?session=            -> drop the last measurement (mis-click)
 */
const express = require('express');
const FormData = require('form-data');
const attendancePhotos = require('../../services/attendancePhotos'); // service-role client: the bucket is private
const { authenticateToken, isAdmin } = require('../middleware/auth');
const { buildReport } = require('../lib/calibration');

const BUCKET = 'attendance-photos';
const sessionKey = (s) => (/^[A-Za-z0-9_-]{1,40}$/.test(String(s || '')) ? String(s) : new Date().toISOString().slice(0, 10));
const filePath = (session) => `calibration/${session}.json`;

async function readRows(session) {
    const { data, error } = await attendancePhotos.getClient().storage.from(BUCKET).download(filePath(session));
    if (error || !data) return [];
    try {
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const rows = JSON.parse(text);
        return Array.isArray(rows) ? rows : [];
    } catch (_e) { return []; }
}
async function writeRows(session, rows) {
    const { error } = await attendancePhotos.getClient().storage.from(BUCKET).upload(filePath(session), Buffer.from(JSON.stringify(rows)), {
        contentType: 'application/json', upsert: true, cacheControl: '0',
    });
    if (error) throw new Error('Could not save measurement: ' + error.message);
}

module.exports = function calibrationRoutes({ engineHttp, engineUrl, upload }) {
    const router = express.Router();
    const engineThreshold = async () => {
        try { const { data } = await engineHttp.get(`${engineUrl}/health`, { timeout: 10000 }); return data?.threshold ?? null; } catch (_e) { return null; }
    };

    router.post('/api/biometrics/face/measure', authenticateToken, isAdmin, upload.single('file'), async (req, res) => {
        try {
            if (!req.file?.buffer?.length) return res.status(400).json({ error: 'No image received' });
            const session = sessionKey(req.body.session);
            const form = new FormData();
            form.append('file', req.file.buffer, { filename: 'frame.jpg', contentType: req.file.mimetype || 'image/jpeg' });
            const { data } = await engineHttp.post(`${engineUrl}/api/biometrics/face/measure`, form, { headers: form.getHeaders(), timeout: 60000 });
            if (data?.success === false) return res.status(422).json({ error: data.message || 'Engine could not measure this frame', result: data });

            const record = {
                at: new Date().toISOString(),
                session,
                claimed_id: String(req.body.claimed_id || '').trim().toUpperCase(),
                claimed_name: String(req.body.claimed_name || '').trim().slice(0, 80),
                condition: String(req.body.condition || 'normal').trim().slice(0, 40),
                face_found: !!data.face_found,
                matched_id: data.best?.employee_id || null,
                matched_name: data.best?.name || null,
                distance: data.best?.distance ?? null,
                second_id: data.second?.employee_id || null,
                second_distance: data.second?.distance ?? null,
                gap: data.gap ?? null,
                threshold_at_time: data.threshold ?? null,
                would_pass: data.would_pass ?? null,
                by: req.user?.email || 'admin',
            };
            const rows = await readRows(session);
            rows.push(record);
            await writeRows(session, rows);
            res.json({ result: data, record, rows, report: buildReport(rows, data.threshold) });
        } catch (err) {
            console.error('[Calibration] measure failed:', err.message);
            res.status(502).json({ error: err.response?.data?.message || err.response?.data?.detail || err.message || 'Engine measurement failed' });
        }
    });

    router.get('/api/biometrics/face/measure/report', authenticateToken, isAdmin, async (req, res) => {
        try {
            const session = sessionKey(req.query.session);
            const [rows, threshold] = await Promise.all([readRows(session), engineThreshold()]);
            res.json({ session, threshold, rows, report: buildReport(rows, threshold) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/api/biometrics/face/measure/last', authenticateToken, isAdmin, async (req, res) => {
        try {
            const session = sessionKey(req.query.session);
            const rows = await readRows(session);
            const removed = rows.pop() || null;
            if (removed) await writeRows(session, rows);
            const threshold = await engineThreshold();
            res.json({ removed, rows, report: buildReport(rows, threshold) });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
