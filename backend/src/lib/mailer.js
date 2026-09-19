/** SMTP sender for alert emails. Configured by ALERT_SMTP_USER / ALERT_SMTP_PASS (Gmail app password). */
const nodemailer = require('nodemailer');

function config() {
    const user = process.env.ALERT_SMTP_USER;
    const pass = process.env.ALERT_SMTP_PASS;
    const to = String(process.env.ALERT_EMAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    return { user, pass, to, configured: Boolean(user && pass && to.length) };
}

let transport = null;
function getTransport(c) {
    if (!transport) {
        transport = nodemailer.createTransport({
            host: process.env.ALERT_SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.ALERT_SMTP_PORT) || 465,
            secure: (Number(process.env.ALERT_SMTP_PORT) || 465) === 465,
            auth: { user: c.user, pass: c.pass },
        });
    }
    return transport;
}

async function sendMail({ subject, text, html, to }) {
    const c = config();
    if (!c.configured) throw new Error('Email alerts are not configured (set ALERT_SMTP_USER, ALERT_SMTP_PASS, ALERT_EMAIL_TO).');
    const info = await getTransport(c).sendMail({
        from: `"Englabs Attendance" <${c.user}>`, to: to || c.to, subject, text, html,
    });
    return { messageId: info.messageId, recipients: Array.isArray(to || c.to) ? (to || c.to).length : 1 };
}

module.exports = { config, sendMail };
