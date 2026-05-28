const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authenticateToken } = require('../middleware/auth');

router.post('/mark', attendanceController.markAttendance);
router.get('/', authenticateToken, attendanceController.getAttendanceList);
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
