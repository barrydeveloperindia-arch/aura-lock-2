const assert = require('node:assert/strict');
const { buildDailySummary, formatEmail } = require('./alerts');

const emp = (id, name, extra = {}) => ({ id: `u-${id}`, employee_id: id, name, department: 'Workshop', company: 'Englabs India Pvt Ltd', ...extra });
const employees = [emp('EL001', 'Asha'), emp('EL002', 'Bilal'), emp('EL003', 'Chetan'), emp('EL004', 'Dev'), emp('EL099', 'Guest Man', { department: 'Guest' })];
// 2026-09-18 is a Friday. 03:30 UTC = 09:00 IST (on time), 04:00 UTC = 09:30 IST (late).
const day = '2026-09-18';
const attendance = [
    { employee_id: 'u-EL001', check_in: '2026-09-18T03:30:00Z', status: 'ON_TIME' },
    { employee_id: 'u-EL002', check_in: '2026-09-18T04:00:00Z', status: 'LATE' },
];

describe('buildDailySummary', () => {
    test('splits present / late / on leave / not in yet, and never counts guests', () => {
        const s = buildDailySummary({ date: day, employees, attendance, leaves: [{ employee_id: 'u-EL003', type: 'CL', status: 'Approved' }] });
        assert.equal(s.total, 4);
        assert.deepEqual(s.present.map(p => p.employee_id), ['EL001', 'EL002']);
        assert.deepEqual(s.late.map(p => [p.employee_id, p.time]), [['EL002', '09:30']]);
        assert.deepEqual(s.onLeave.map(p => [p.employee_id, p.type]), [['EL003', 'CL']]);
        assert.deepEqual(s.absent.map(p => p.employee_id), ['EL004']);
    });

    test('a rejected leave does not hide an absence', () => {
        const s = buildDailySummary({ date: day, employees, attendance, leaves: [{ employee_id: 'u-EL003', type: 'CL', status: 'Rejected' }] });
        assert.deepEqual(s.absent.map(p => p.employee_id), ['EL003', 'EL004']);
    });

    test('someone on leave who still checked in counts as present, not on leave', () => {
        const s = buildDailySummary({ date: day, employees, attendance, leaves: [{ employee_id: 'u-EL001', type: 'CL', status: 'Approved' }] });
        assert.equal(s.onLeave.length, 0);
        assert.ok(s.present.some(p => p.employee_id === 'EL001'));
    });

    test('Sunday and holidays are skipped with a reason', () => {
        assert.deepEqual(buildDailySummary({ date: '2026-09-20', employees, attendance: [] }), { date: '2026-09-20', skip: true, reason: 'Sunday' });
        const h = buildDailySummary({ date: day, employees, attendance: [], holidays: [{ date: day, name: 'Test Holiday' }] });
        assert.equal(h.skip, true);
        assert.match(h.reason, /Test Holiday/);
    });

    test('uses the earliest check-in when a person has several rows', () => {
        const s = buildDailySummary({ date: day, employees, attendance: [
            { employee_id: 'u-EL001', check_in: '2026-09-18T05:00:00Z', status: 'LATE' },
            { employee_id: 'u-EL001', check_in: '2026-09-18T03:30:00Z', status: 'ON_TIME' },
        ] });
        assert.equal(s.late.length, 0);
        assert.equal(s.present.find(p => p.employee_id === 'EL001').time, '09:00');
    });
});

describe('formatEmail', () => {
    const s = buildDailySummary({ date: day, employees, attendance, leaves: [{ employee_id: 'u-EL003', type: 'CL', status: 'Approved' }] });
    test('subject carries the headline numbers', () => {
        const { subject } = formatEmail(s, '09:45');
        assert.match(subject, /1 present|2 present/);
        assert.match(subject, /1 late/);
        assert.match(subject, /1 not in yet/);
    });
    test('text and html list the names, and html escapes markup', () => {
        const evil = buildDailySummary({ date: day, employees: [emp('EL005', '<b>Eve</b>')], attendance: [] });
        const { text, html } = formatEmail(evil);
        assert.ok(text.includes('<b>Eve</b>'));
        assert.ok(!html.includes('<b>Eve</b>'));
        assert.ok(html.includes('&lt;b&gt;Eve'));
        const ok = formatEmail(s, '09:45');
        assert.ok(ok.text.includes('Dev') && ok.text.includes('Bilal') && ok.text.includes('Chetan'));
    });
});

const { lateRecipients, formatLateStaffEmail, formatLeaveDecisionEmail } = require('./alerts');

describe('personal emails to staff', () => {
    const staff = [
        emp('EL001', 'Asha', { email: 'asha@real.com', notify_email: true }),
        emp('EL002', 'Bilal', { email: 'bilal@real.com', notify_email: false }),
        emp('EL003', 'Chetan', { email: 'not-an-email', notify_email: true }),
        emp('EL004', 'Dev', { email: null, notify_email: true }),
    ];
    const late = ['u-EL001', 'u-EL002', 'u-EL003', 'u-EL004'].map(id => ({ employee_id: id, check_in: '2026-09-18T04:30:00Z', status: 'LATE' }));
    const s = buildDailySummary({ date: day, employees: staff, attendance: late });

    test('only late staff who are switched on AND have a valid address get a personal email', () => {
        assert.deepEqual(lateRecipients(s).map(r => r.employee_id), ['EL001']);
    });
    test('the CEO and guests never get a personal late email', () => {
        const people = [emp('EL010', 'Boss', { department: 'CEO', email: 'boss@real.com', notify_email: true }), emp('EL011', 'Visitor', { department: 'Guest', email: 'v@real.com', notify_email: true }), emp('EL012', 'Worker', { email: 'w@real.com', notify_email: true })];
        const att = ['u-EL010', 'u-EL011', 'u-EL012'].map(id => ({ employee_id: id, check_in: '2026-09-18T04:30:00Z', status: 'LATE' }));
        const sum = buildDailySummary({ date: day, employees: people, attendance: att });
        assert.deepEqual(lateRecipients(sum).map(r => r.employee_id), ['EL012']);
    });
    test('the late email is addressed to the person and states the time', () => {
        const m = formatLateStaffEmail(lateRecipients(s)[0], day);
        assert.match(m.subject, /late today \(10:00\)/);
        assert.match(m.text, /^Hi Asha,/);
        assert.ok(m.html.includes('10:00 IST'));
    });
    test('leave decisions read correctly for approved and rejected', () => {
        const ok = formatLeaveDecisionEmail({ name: 'Anurag Sahni', date: day, type: 'CL', status: 'Approved', approvedBy: ['Bharat sir', 'Shreya mam'], note: 'family function' });
        assert.match(ok.subject, /casual leave .* was approved/);
        assert.ok(ok.text.includes('approved by Bharat sir and Shreya mam'));
        assert.ok(ok.text.includes('family function'));
        const no = formatLeaveDecisionEmail({ name: 'Anurag Sahni', date: day, type: 'SL', status: 'Rejected', approvedBy: ['Admin'] });
        assert.match(no.subject, /sick leave .* was not approved/);
        assert.ok(no.text.includes('normal working day'));
    });
    test('leave email escapes markup from the reason', () => {
        const m = formatLeaveDecisionEmail({ name: 'A', date: day, type: 'CL', status: 'Approved', note: '<script>x</script>' });
        assert.ok(!m.html.includes('<script>'));
    });
});
