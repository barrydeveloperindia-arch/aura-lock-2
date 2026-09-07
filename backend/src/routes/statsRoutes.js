const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticateToken } = require('../middleware/auth');

// Dashboard Stats Endpoint
router.get('/api/stats', authenticateToken, statsController.getStats);

module.exports = router;
