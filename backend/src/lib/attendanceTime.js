/**
 * One place for every "what day / how late is it" rule.
 *
 * The business runs in Asia/Kolkata; the database stores UTC. Cloud Run
 * containers run in UTC, so `new Date().toISOString().slice(0, 10)` is the
 * WRONG day between 00:00 and 05:29 IST and `toTimeString()` compares against
 * UTC clocks. Use these helpers instead.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Office start 09:00, grace 15 min. Arrivals after 09:15 IST are LATE. */
const LATE_AFTER_MINUTES = 9 * 60 + 15;

/** "YYYY-MM-DD" of the given instant in IST (default: now). */
function istDateString(d = new Date()) {
    return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since IST midnight for an ISO/Date instant. */
function istMinutesOfDay(instant) {
    const d = new Date(new Date(instant).getTime() + IST_OFFSET_MS);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "HH:MM" in IST. */
function istClock(instant) {
    const m = istMinutesOfDay(instant);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function isLateIST(checkInInstant) {
    if (!checkInInstant) return false;
    const t = new Date(checkInInstant);
    if (Number.isNaN(t.getTime())) return false;
    return istMinutesOfDay(t) > LATE_AFTER_MINUTES;
}

/** Prefer the status stored at check-in time; fall back to the rule. */
function rowIsLate(row) {
    if (row?.status === 'LATE') return true;
    if (row?.status === 'ON_TIME') return false;
    return isLateIST(row?.check_in);
}

/** UTC instant when the IST calendar day starts / ends (for created_at filters). */
function istDayStartUTC(dateStr) {
    return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - IST_OFFSET_MS).toISOString();
}
function istDayEndUTC(dateStr) {
    return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() - IST_OFFSET_MS + 24 * 60 * 60 * 1000 - 1).toISOString();
}

/** First and last day (YYYY-MM-DD) of a calendar month, no timezone involved. */
function monthRange(year, month) {
    const y = parseInt(year, 10), m = parseInt(month, 10);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2000 || y > 2100) return null;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

module.exports = { IST_OFFSET_MS, LATE_AFTER_MINUTES, istDateString, istMinutesOfDay, istClock, isLateIST, rowIsLate, istDayStartUTC, istDayEndUTC, monthRange };
