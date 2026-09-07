const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-secret' : undefined);
if (!JWT_SECRET) throw new Error('JWT_SECRET is not set');
const loginFailures = new Map();

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const ip = req.ip;

    // --- Security: Brute-Force Check ---
    const failures = loginFailures.get(ip) || { count: 0, lastTry: 0 };
    if (failures.count >= 5 && (Date.now() - failures.lastTry < 300000)) { // 5 min lockout
        return res.status(429).json({ message: 'IP temporarily locked out. Try later.' });
    }

    try {
        const adminEmail = process.env.ADMIN_EMAIL, adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminEmail || !adminPassword) return res.status(503).json({ message: 'Admin login is not configured' });
        if (email && password && email === adminEmail && password === adminPassword) {
            console.log("✅ Admin logged in successfully:", email);
            const user = { name: 'Super Admin', email: email, role: 'admin' };
            const accessToken = jwt.sign(user, JWT_SECRET, { expiresIn: '24h' });
            // Reset failures on success
            loginFailures.delete(ip);
            return res.json({ token: accessToken, user });
        }

        console.warn("❌ Invalid credentials attempt for:", email);
        // Track failures
        failures.count++;
        failures.lastTry = Date.now();
        loginFailures.set(ip, failures);

        return res.status(401).json({ message: 'Invalid credentials' });
    } catch (error) {
        console.error("❌ Login error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

exports.updateCredentials = async (req, res) => {
    const { newEmail, newPassword } = req.body;
    try {
        if (newPassword && String(newPassword).length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        // Applies to this running instance only. Persisting means updating the
        // ADMIN_* env vars on Cloud Run (scripts/deploy_backend.ps1 reads backend/.env).
        if (newEmail) process.env.ADMIN_EMAIL = newEmail;
        if (newPassword) process.env.ADMIN_PASSWORD = newPassword;
        const envPath = path.join(__dirname, '../../.env');
        if (fs.existsSync(envPath)) {
            let envContent = fs.readFileSync(envPath, 'utf8');
            if (newEmail) envContent = envContent.replace(/ADMIN_EMAIL=.*/, `ADMIN_EMAIL=${newEmail}`);
            if (newPassword) envContent = envContent.replace(/ADMIN_PASSWORD=.*/, `ADMIN_PASSWORD=${newPassword}`);
            fs.writeFileSync(envPath, envContent);
        }
        console.log("Admin credentials updated by", req.user?.email);
        res.json({ success: true, message: 'Credentials updated for this server instance. Update the Cloud Run env vars to make it permanent.' });
    } catch (error) {
        console.error("❌ Credentials Update Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
