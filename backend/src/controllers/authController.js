const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = process.env.JWT_SECRET || 'auralock_super_secret_key_2026';
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
        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
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
        // Point to backend/.env
        const envPath = path.join(__dirname, '../../.env');
        let envContent = fs.readFileSync(envPath, 'utf8');

        if (newEmail) {
            envContent = envContent.replace(/ADMIN_EMAIL=.*/, `ADMIN_EMAIL=${newEmail}`);
            process.env.ADMIN_EMAIL = newEmail;
        }
        if (newPassword) {
            envContent = envContent.replace(/ADMIN_PASSWORD=.*/, `ADMIN_PASSWORD=${newPassword}`);
            process.env.ADMIN_PASSWORD = newPassword;
        }

        fs.writeFileSync(envPath, envContent);
        console.log("✅ Admin credentials updated in .env");
        res.json({ success: true, message: 'Credentials updated successfully. Server may restart.' });
    } catch (error) {
        console.error("❌ Credentials Update Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
