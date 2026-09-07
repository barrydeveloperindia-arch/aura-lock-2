const express = require('express');
const router = express.Router();
const multer = require('multer');
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Optional JPEG frame for non-face terminals (fingerprint / RFID); JSON bodies still work.
const frameUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Terminal devices prove themselves with a shared key when TERMINAL_KEY is configured
const terminalKey = (req, res, next) => {
    // A logged-in admin (browser scanner / dashboard) may also mark attendance
    if (req.get('authorization')) return authenticateToken(req, res, next);
    const expected = process.env.TERMINAL_KEY;
    if (!expected) return next();
    const given = req.get('x-terminal-key') || req.body?.terminal_key;
    if (given && given === expected) return next();
    return res.status(401).json({ error: 'Terminal key required' });
};
router.post('/mark', terminalKey, frameUpload.single('file'), attendanceController.markAttendance);
router.get('/', authenticateToken, attendanceController.getAttendanceList);

// Attendance photos: signed URL for one event, employee avatars, and admin retention sweep
router.get('/avatars', authenticateToken, attendanceController.getEmployeeAvatars);
router.get('/:id/photo/:kind', authenticateToken, attendanceController.getAttendancePhoto);
router.post('/photos/cleanup', authenticateToken, isAdmin, attendanceController.cleanupAttendancePhotos);
router.get('/employee/:employee_id', authenticateToken, attendanceController.getEmployeeHistory);
router.get('/employee/:employee_id/summary', authenticateToken, attendanceController.getEmployeeSummary);
router.get('/export/excel/:employee_id', authenticateToken, attendanceController.exportExcelEmployee);
router.get('/export/pdf/:employee_id', authenticateToken, attendanceController.exportPdfEmployee);
router.get('/export/excel', authenticateToken, attendanceController.exportExcel);
router.get('/export/pdf', authenticateToken, attendanceController.exportPdf);
router.get('/report', authenticateToken, attendanceController.getReport);
router.get('/monthly-report', authenticateToken, attendanceController.getMonthlyReport);
router.get('/analytics', authenticateToken, attendanceController.getAnalytics);
router.get('/attendance-analytics', authenticateToken, attendanceController.getAnalytics);
router.get('/activity', authenticateToken, attendanceController.getActivity);

module.exports = router;
