const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// Dashboard Stats Endpoint
router.get('/api/stats', statsController.getStats);

module.exports = router;
