const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

const rateLimit = require('express-rate-limit');

// Login brute-force guard, per client IP (Cloud Run sets X-Forwarded-For; server.js trusts 1 proxy):
// 10 attempts per 15 minutes, successful logins do not count. The controller adds a
// second layer (5 failures -> 5 min lock) so a guessed password still needs many windows.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.LOGIN_ATTEMPTS_PER_15_MIN) || 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { message: 'Too many login attempts. Try again in 15 minutes.' },
});

// Login Endpoint
router.post('/auth/login', authLimiter, authController.login);

// Update Admin Credentials
const { authenticateToken, isAdmin } = require('../middleware/auth');
router.post('/api/system/update-credentials', authenticateToken, isAdmin, authController.updateCredentials);

module.exports = router;
