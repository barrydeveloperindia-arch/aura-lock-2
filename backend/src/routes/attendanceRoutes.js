const express = require('express');
const router = express.Router();
const multer = require('multer');
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Optional JPEG frame for non-face terminals (fingerprint / RFID); JSON bodies still work.
const frameUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.post('/mark', frameUpload.single('file'), attendanceController.markAttendance);
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
router.get('/report', attendanceController.getReport);
router.get('/monthly-report', authenticateToken, attendanceController.getMonthlyReport);
router.get('/analytics', authenticateToken, attendanceController.getAnalytics);
router.get('/attendance-analytics', authenticateToken, attendanceController.getAnalytics);
router.get('/activity', attendanceController.getActivity);

module.exports = router;
