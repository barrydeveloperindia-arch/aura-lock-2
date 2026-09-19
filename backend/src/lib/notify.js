/**
 * Email one staff member, only if an admin switched notifications on for them (employees.notify_email)
 * and the stored address looks valid. Best-effort: never throws, never blocks the caller.
 */
const mailer = require('./mailer');
const { isPlausibleEmail } = require('./alerts');

function canNotify(employee) {
    // Guests and the CEO are never emailed automatically; the CEO only gets a message when asked.
    if (!employee || employee.department === 'Guest' || employee.department === 'CEO' || employee.designation === 'CEO') return false;
    return Boolean(employee.notify_email === true && isPlausibleEmail(employee.email));
}

async function emailStaff(employee, message) {
    if (!canNotify(employee)) return false;
    if (!mailer.config().configured) return false;
    try { await mailer.sendMail({ ...message, to: employee.email }); return true; }
    catch (e) { console.warn('[Notify] email to staff failed:', e.message); return false; }
}

/** Who is asked to approve leaves: ALERT_LEAVE_APPROVERS (comma separated). Empty = nobody is emailed. */
function approverEmails() {
    return String(process.env.ALERT_LEAVE_APPROVERS || '').split(',').map(x => x.trim()).filter(isPlausibleEmail);
}

async function emailApprovers(message) {
    const to = approverEmails();
    if (to.length === 0 || !mailer.config().configured) return false;
    try { await mailer.sendMail({ ...message, to }); return true; }
    catch (e) { console.warn('[Notify] approver email failed:', e.message); return false; }
}

module.exports = { canNotify, emailStaff, approverEmails, emailApprovers };
