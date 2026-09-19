/**
 * Email one staff member, only if an admin switched notifications on for them (employees.notify_email)
 * and the stored address looks valid. Best-effort: never throws, never blocks the caller.
 */
const mailer = require('./mailer');
const { isPlausibleEmail } = require('./alerts');

function canNotify(employee) {
    return Boolean(employee && employee.notify_email === true && isPlausibleEmail(employee.email));
}

async function emailStaff(employee, message) {
    if (!canNotify(employee)) return false;
    if (!mailer.config().configured) return false;
    try { await mailer.sendMail({ ...message, to: employee.email }); return true; }
    catch (e) { console.warn('[Notify] email to staff failed:', e.message); return false; }
}

module.exports = { canNotify, emailStaff };
