const assert = require('node:assert/strict');
const { buildAbsenceCandidates } = require('./absence');
const { formatAbsenceNoticeEmail } = require('./alerts');

const emp = (id, name, extra = {}) => ({ id: `u-${id}`, employee_id: id, name, department: 'Workshop', company: 'Englabs India Pvt Ltd', status: 'Active', email: `${id.toLowerCase()}@real.com`, notify_email: true, ...extra });
const day = '2026-09-18'; // Friday
const staff = [
    emp('EL001', 'Asha'), emp('EL002', 'Bilal'), emp('EL003', 'Chetan'), emp('EL004', 'Dev'),
    emp('EL005', 'Eve', { company: 'Sky5 Hotel' }),
    emp('EL006', 'Boss', { department: 'CEO' }),
    emp('EL007', 'Visitor', { department: 'Guest' }),
    emp('EL011', 'Chief', { department: 'Management', designation: 'CEO' }),
    emp('EL008', 'Newbie', { joining_date: '2026-09-20' }),
    emp('EL009', 'Gone', { last_working_day: '2026-09-10' }),
    emp('EL010', 'NoMail', { email: null, notify_email: false }),
];
const attendance = [{ employee_id: 'u-EL001', check_in: '2026-09-18T03:30:00Z' }];

describe('buildAbsenceCandidates', () => {
    test('only Englabs staff who were absent with no leave / a rejected leave are candidates', () => {
        const r = buildAbsenceCandidates({
            date: day, employees: staff, attendance,
            leaves: [{ employee_id: 'u-EL002', type: 'CL', status: 'Approved' }, { employee_id: 'u-EL003', type: 'CL', status: 'Rejected' }],
        });
        assert.deepEqual(r.notices.map(n => n.employee_id), ['EL003', 'EL004', 'EL010']);
        assert.equal(r.notices.find(n => n.employee_id === 'EL003').reason, 'Leave was rejected');
        assert.equal(r.notices.find(n => n.employee_id === 'EL004').reason, 'No leave application');
    });

    test('other companies, CEO, guests, not-yet-joined and already-left staff are never listed', () => {
        const r = buildAbsenceCandidates({ date: day, employees: staff, attendance, leaves: [] });
        const ids = r.notices.map(n => n.employee_id);
        for (const skipped of ['EL005', 'EL006', 'EL007', 'EL008', 'EL009', 'EL011']) assert.ok(!ids.includes(skipped), skipped);
    });

    test('a leave that is still pending is held back, not fined', () => {
        const r = buildAbsenceCandidates({ date: day, employees: staff, attendance, leaves: [{ employee_id: 'u-EL002', type: 'SL', status: 'Pending' }] });
        assert.ok(!r.notices.some(n => n.employee_id === 'EL002'));
        assert.deepEqual(r.pendingLeave.map(n => [n.employee_id, n.leaveType]), [['EL002', 'SL']]);
    });

    test('someone who checked in is not a candidate; approved leave wins over a rejected duplicate', () => {
        const r = buildAbsenceCandidates({ date: day, employees: staff, attendance, leaves: [
            { employee_id: 'u-EL002', type: 'CL', status: 'Rejected' }, { employee_id: 'u-EL002', type: 'CL', status: 'Approved' }] });
        assert.ok(!r.notices.some(n => ['EL001', 'EL002'].includes(n.employee_id)));
    });

    test('emailable only when the switch is on and the address is valid', () => {
        const r = buildAbsenceCandidates({ date: day, employees: staff, attendance, leaves: [] });
        assert.equal(r.notices.find(n => n.employee_id === 'EL004').emailable, true);
        assert.equal(r.notices.find(n => n.employee_id === 'EL010').emailable, false);
    });

    test('Sundays and holidays produce no candidates', () => {
        assert.deepEqual(buildAbsenceCandidates({ date: '2026-09-20', employees: staff }).notices, []);
        const h = buildAbsenceCandidates({ date: day, employees: staff, holidays: [{ date: day, name: 'Festival' }] });
        assert.equal(h.skip, true);
        assert.match(h.reason, /Festival/);
    });
});

describe('formatAbsenceNoticeEmail', () => {
    const m = formatAbsenceNoticeEmail({ name: 'Dev Kumar', date: day, amount: 500 });
    test('states the date, the fine and how to raise a mistake', () => {
        assert.match(m.subject, /absence without approved leave/i);
        assert.ok(m.text.startsWith('Dear Dev,'));
        assert.ok(m.text.includes('Rs. 500') && m.text.includes('18 Sept'));
        assert.match(m.text, /incorrect|contact the office/i);
        assert.ok(m.html.includes('Rs. 500'));
    });
});
