const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Basic rate limiter mock (can be moved to a dedicated middleware later)
const authLimiter = (req, res, next) => next();

// Login Endpoint
router.post('/auth/login', authLimiter, authController.login);

// Update Admin Credentials
const { authenticateToken, isAdmin } = require('../middleware/auth');
router.post('/api/system/update-credentials', authenticateToken, isAdmin, authController.updateCredentials);

module.exports = router;
