const jwt = require('jsonwebtoken');
const supabase = require('../../supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'auralock_super_secret_key_2026';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            console.error("❌ Token Verification Failed:", err.message);
            return res.status(403).json({ error: "Forbidden", message: "Invalid or expired token" });
        }

        try {
            // --- Security Check: Account Status ---
            if (user.role !== 'admin') {
                const { data: dbUser, error: dbError } = await supabase.from('employees').select('status').eq('email', user.email).single();

                if (dbError) {
                    console.error("❌ Database Status Check Error:", dbError.message);
                }

                if (dbUser && dbUser.status !== 'Active') {
                    return res.status(403).json({ error: "Access Denied", message: "Account is disabled or deleted" });
                }
            }

            console.log("🔓 Authenticated User:", user.email);
            req.user = user;
            next();
        } catch (statusError) {
            console.error("❌ Critical Auth Middleware Error:", statusError.message);
            return res.status(500).json({ error: "Internal Server Error", message: "Authentication validation failed" });
        }
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: "Access Denied", message: "Admin privileges required" });
    }
};

module.exports = { authenticateToken, isAdmin };
