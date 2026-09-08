/**
 * Leave register maths (pure, no I/O).
 *
 * A leave is one employee, one date, one type. Holidays are per date for
 * everyone. A month's "working days" are the calendar days minus weekends
 * (Saturday + Sunday by default, configurable) minus holidays. For a person:
 *   present = distinct attendance dates in the month
 *   leave   = leave dates that fall on working days (a leave on a Sunday is not counted)
 *   absent  = working days − present − leave (never below 0)
 */
const LEAVE_TYPES = {
    CL: 'Casual leave',
    SL: 'Sick leave',
    EL: 'Earned leave',
    WFH: 'Work from home',
    OD: 'On duty (site / client visit)',
};
const DEFAULT_WEEKEND = [0, 6]; // Sunday, Saturday
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidLeaveType = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(LEAVE_TYPES, t.toUpperCase());
const isValidDate = (d) => typeof d === 'string' && DATE_RE.test(d) && !Number.isNaN(new Date(d + 'T00:00:00Z').getTime());

/** Every working date between from and to (inclusive, yyyy-MM-dd), as a Set. */
function workingDates(from, to, holidays = [], weekend = DEFAULT_WEEKEND) {
    const out = new Set();
    if (!isValidDate(from) || !isValidDate(to)) return out;
    const hol = new Set([...holidays].map(h => (typeof h === 'string' ? h : h?.date)).filter(Boolean));
    const d = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    while (d <= end) {
        const iso = d.toISOString().slice(0, 10);
        if (!weekend.includes(d.getUTCDay()) && !hol.has(iso)) out.add(iso);
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
}

/**
 * Per-person month summary.
 * @param {Set<string>} working   working dates of the month
 * @param {Iterable<string>} presentDates attendance dates
 * @param {{date:string,type:string}[]} leaves this person's leaves in the month
 */
function summarize(working, presentDates, leaves = []) {
    const present = new Set([...presentDates].filter(d => working.has(d)));
    const byType = {};
    const leaveDates = new Set();
    for (const l of leaves) {
        if (!l || !working.has(l.date) || present.has(l.date)) continue; // a scan beats a leave on the same day
        const t = String(l.type || '').toUpperCase();
        if (!LEAVE_TYPES[t] || leaveDates.has(l.date)) continue;
        leaveDates.add(l.date);
        byType[t] = (byType[t] || 0) + 1;
    }
    const presentDays = new Set([...presentDates]).size; // count every attended day, weekends included
    return {
        presentDays,
        leaveDays: leaveDates.size,
        byType,
        absentDays: Math.max(0, working.size - present.size - leaveDates.size),
    };
}

module.exports = { LEAVE_TYPES, DEFAULT_WEEKEND, isValidLeaveType, isValidDate, workingDates, summarize };
