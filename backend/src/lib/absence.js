/**
 * Absence without approved leave (Englabs staff only): the list an admin reviews before any
 * fine notice is sent. Pure functions, unit-tested; routes do the fetching and sending.
 *
 * Candidate  = active Englabs staff (not CEO / Guest), on a working day, no check-in, and no
 *              leave on record OR a Rejected leave.
 * Held back  = leave still Pending (undecided): nobody should be fined until it is decided.
 * Fine       = never applied by the system; it only emails the notice when an admin clicks Send.
 */
const { workingDates } = require('./leaves');
const { isPlausibleEmail } = require('./alerts');

const COMPANY = 'Englabs India Pvt Ltd';
const EXEMPT_DEPARTMENTS = new Set(['Guest', 'CEO']);
const FINE_INR = Number(process.env.ABSENCE_FINE_INR) || 500;

const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// Strongest leave state wins when a person somehow has several rows for the day.
const RANK = { Approved: 3, Pending: 2, Rejected: 1 };
function leaveStatus(l) { return l.status || 'Approved'; }

function buildAbsenceCandidates({ date, employees = [], attendance = [], leaves = [], holidays = [] }) {
    if (workingDates(date, date, holidays).size === 0) {
        const holiday = holidays.find(h => h.date === date);
        return { date, skip: true, reason: holiday ? `Holiday (${holiday.name})` : 'Sunday', notices: [], pendingLeave: [] };
    }
    const present = new Set(attendance.filter(a => a.check_in).map(a => a.employee_id));
    const leaveBy = new Map();
    for (const l of leaves) {
        const prev = leaveBy.get(l.employee_id);
        if (!prev || (RANK[leaveStatus(l)] || 0) > (RANK[leaveStatus(prev)] || 0)) leaveBy.set(l.employee_id, l);
    }

    const notices = [], pendingLeave = [];
    for (const e of employees) {
        if ((e.company || COMPANY) !== COMPANY) continue;
        if (EXEMPT_DEPARTMENTS.has(e.department) || e.designation === 'CEO') continue;
        if (e.status && e.status !== 'Active') continue;
        if (e.joining_date && e.joining_date > date) continue;
        if (e.last_working_day && e.last_working_day < date) continue;
        if (present.has(e.id)) continue;

        const l = leaveBy.get(e.id);
        const status = l ? leaveStatus(l) : null;
        const item = { employee_id: e.employee_id, name: e.name, department: e.department, email: e.email || null };
        if (status === 'Approved') continue;
        if (status === 'Pending') { pendingLeave.push({ ...item, leaveType: l.type }); continue; }
        notices.push({
            ...item,
            reason: status === 'Rejected' ? 'Leave was rejected' : 'No leave application',
            emailable: e.notify_email === true && isPlausibleEmail(e.email),
        });
    }
    notices.sort(byName); pendingLeave.sort(byName);
    return { date, skip: false, notices, pendingLeave, fineInr: FINE_INR };
}

module.exports = { buildAbsenceCandidates, FINE_INR, COMPANY };
