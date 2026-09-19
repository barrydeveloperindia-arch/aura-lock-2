/**
 * Daily attendance alert: who is late, who has not come in, who is on leave.
 * Pure functions (no I/O) so the rules are unit-tested; the route does the fetching + sending.
 */
const { rowIsLate, istClock } = require('./attendanceTime');
const { workingDates } = require('./leaves');

const NON_STAFF_DEPARTMENTS = new Set(['Guest']);
const DEFAULT_COMPANY = 'Englabs India Pvt Ltd';

const byName = (a, b) => String(a.name).localeCompare(String(b.name));

/**
 * employees:  [{ id, employee_id, name, department, company }]  (active only)
 * attendance: [{ employee_id: <employees.id>, check_in, status }]
 * leaves:     [{ employee_id: <employees.id>, type, status }]
 * holidays:   [{ date, name }]
 */
function buildDailySummary({ date, employees = [], attendance = [], leaves = [], holidays = [] }) {
    if (workingDates(date, date, holidays).size === 0) {
        const holiday = holidays.find(h => h.date === date);
        return { date, skip: true, reason: holiday ? `Holiday (${holiday.name})` : 'Sunday' };
    }

    const staff = employees.filter(e => !NON_STAFF_DEPARTMENTS.has(e.department));
    const checkIn = new Map();
    for (const a of attendance) {
        if (!a.check_in) continue;
        const prev = checkIn.get(a.employee_id);
        if (!prev || new Date(a.check_in) < new Date(prev.check_in)) checkIn.set(a.employee_id, a);
    }
    const leaveBy = new Map();
    for (const l of leaves) if (l.status !== 'Rejected') leaveBy.set(l.employee_id, l);

    const present = [], late = [], onLeave = [], absent = [];
    for (const e of staff) {
        const item = { name: e.name, employee_id: e.employee_id, company: e.company || DEFAULT_COMPANY, department: e.department, email: e.email || null, lateAlert: e.notify_email === true };
        const a = checkIn.get(e.id);
        if (a) {
            const row = { ...item, time: istClock(a.check_in) };
            present.push(row);
            if (rowIsLate(a)) late.push(row);
        } else if (leaveBy.has(e.id)) onLeave.push({ ...item, type: leaveBy.get(e.id).type });
        else absent.push(item);
    }
    present.sort(byName); late.sort((a, b) => a.time.localeCompare(b.time)); onLeave.sort(byName); absent.sort(byName);
    return { date, skip: false, total: staff.length, present, late, onLeave, absent };
}

function prettyDate(date) {
    return new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function formatEmail(s, sentAtIst) {
    const d = prettyDate(s.date);
    const notIn = s.absent.length;
    const subject = `Attendance ${d}: ${s.present.length} present, ${s.late.length} late, ${notIn} not in yet`;
    const line = (r, extra = '') => `  ${r.employee_id}  ${r.name} (${r.company === DEFAULT_COMPANY ? r.department || 'Englabs' : r.company})${extra}`;
    const text = [
        `Attendance summary for ${d}${sentAtIst ? ` (as of ${sentAtIst} IST)` : ''}`,
        `Present ${s.present.length}  |  Late ${s.late.length}  |  Not in yet ${notIn}  |  On leave ${s.onLeave.length}  |  Staff ${s.total}`,
        '',
        `NOT IN YET (${notIn})`, ...(notIn ? s.absent.map(r => line(r)) : ['  None']),
        '',
        `LATE (${s.late.length})`, ...(s.late.length ? s.late.map(r => line(r, ` - ${r.time}`)) : ['  None']),
        '',
        `ON LEAVE (${s.onLeave.length})`, ...(s.onLeave.length ? s.onLeave.map(r => line(r, ` - ${r.type}`)) : ['  None']),
    ].join('\n');

    const section = (title, rows, fmt, tone) => `
      <h3 style="margin:22px 0 6px;font:600 15px Arial,sans-serif;color:${tone}">${title} (${rows.length})</h3>
      ${rows.length ? `<table style="border-collapse:collapse;width:100%;font:14px Arial,sans-serif">${rows.map(r => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#64748b;width:70px">${esc(r.employee_id)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#0f172a">${esc(r.name)}<div style="font-size:12px;color:#64748b">${esc(r.company === DEFAULT_COMPANY ? r.department || '' : r.company)}</div></td>
        <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#334155;text-align:right">${fmt(r)}</td></tr>`).join('')}</table>`
        : '<div style="font:14px Arial,sans-serif;color:#64748b">None</div>'}`;
    const html = `<div style="max-width:620px;margin:0 auto;padding:20px;font-family:Arial,sans-serif">
      <h2 style="margin:0 0 4px;font:700 20px Arial,sans-serif;color:#0b1e36">Attendance summary</h2>
      <div style="color:#64748b;font-size:14px">${esc(d)}${sentAtIst ? ` &middot; as of ${esc(sentAtIst)} IST` : ''}</div>
      <table style="margin:16px 0;border-collapse:collapse;font:14px Arial,sans-serif"><tr>
        ${[['Present', s.present.length, '#059669'], ['Late', s.late.length, '#b45309'], ['Not in yet', notIn, '#dc2626'], ['On leave', s.onLeave.length, '#7c3aed']]
            .map(([l, n, c]) => `<td style="padding:8px 16px 8px 0"><div style="font:700 24px Arial,sans-serif;color:${c}">${n}</div><div style="color:#64748b;font-size:12px">${l}</div></td>`).join('')}
      </tr></table>
      ${section('Not in yet', s.absent, () => '', '#dc2626')}
      ${section('Late', s.late, r => esc(r.time), '#b45309')}
      ${section('On leave', s.onLeave, r => esc(r.type), '#7c3aed')}
      <div style="margin-top:24px;font-size:12px;color:#94a3b8">Sent automatically by Englabs Attendance Tracker. Guests are not counted.</div></div>`;
    return { subject, text, html };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Late staff who are switched on for a personal email and have a plausible address. */
function lateRecipients(summary) {
    return summary.late.filter(r => r.lateAlert && r.email && EMAIL_RE.test(r.email));
}

function formatLateStaffEmail(person, date) {
    const d = prettyDate(date);
    const first = String(person.name).split(' ')[0];
    const subject = `You checked in late today (${person.time})`;
    const text = [
        `Hi ${first},`,
        '',
        `Your attendance on ${d} was recorded at ${person.time} IST. The office start is 09:00, with a grace time until 09:15, so today is marked late.`,
        '',
        'If this looks wrong (for example a leave or an approved late arrival), please tell the office so it can be corrected.',
        '',
        'Englabs Attendance Tracker (automatic message)',
    ].join('\n');
    const html = `<div style="max-width:520px;font:15px/1.5 Arial,sans-serif;color:#0f172a;padding:16px">
      <p>Hi ${esc(first)},</p>
      <p>Your attendance on <b>${esc(d)}</b> was recorded at <b>${esc(person.time)} IST</b>. The office starts at 09:00 with a grace time until 09:15, so today is marked <b style="color:#b45309">late</b>.</p>
      <p>If this looks wrong (for example a leave or an approved late arrival), please tell the office so it can be corrected.</p>
      <p style="color:#94a3b8;font-size:12px">Englabs Attendance Tracker (automatic message)</p></div>`;
    return { subject, text, html };
}

const LEAVE_NAMES = { CL: 'Casual leave', SL: 'Sick leave', EL: 'Emergency leave', UWL: 'Urgent work leave', OTH: 'Leave' };

function formatLeaveDecisionEmail({ name, date, type, status, approvedBy = [], note }) {
    const first = String(name).split(' ')[0];
    const d = prettyDate(date);
    const kind = LEAVE_NAMES[String(type).toUpperCase()] || 'Leave';
    const approved = status === 'Approved';
    const who = approvedBy.length ? approvedBy.join(' and ') : 'the office';
    const subject = `Your ${kind.toLowerCase()} on ${d} was ${approved ? 'approved' : 'not approved'}`;
    const text = [
        `Hi ${first},`,
        '',
        approved
            ? `Your ${kind.toLowerCase()} for ${d} has been approved by ${who}.`
            : `Your ${kind.toLowerCase()} for ${d} was not approved (${who}). Please speak to the office if you have questions; that day will be counted as a normal working day.`,
        ...(note ? ['', `Reason you gave: ${note}`] : []),
        '',
        'Englabs Attendance Tracker (automatic message)',
    ].join('\n');
    const html = `<div style="max-width:520px;font:15px/1.5 Arial,sans-serif;color:#0f172a;padding:16px">
      <p>Hi ${esc(first)},</p>
      <p>Your ${esc(kind.toLowerCase())} for <b>${esc(d)}</b> ${approved
        ? `has been <b style="color:#059669">approved</b> by ${esc(who)}.`
        : `was <b style="color:#dc2626">not approved</b> (${esc(who)}). Please speak to the office if you have questions; that day will be counted as a normal working day.`}</p>
      ${note ? `<p style="color:#475569">Reason you gave: ${esc(note)}</p>` : ''}
      <p style="color:#94a3b8;font-size:12px">Englabs Attendance Tracker (automatic message)</p></div>`;
    return { subject, text, html };
}

module.exports = { buildDailySummary, formatEmail, formatLateStaffEmail, formatLeaveDecisionEmail, lateRecipients, isPlausibleEmail: (e) => EMAIL_RE.test(String(e || '')), prettyDate };
