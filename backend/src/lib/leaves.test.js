const assert = require('node:assert/strict');
const { workingDates, summarize, isValidLeaveType, isValidDate } = require('./leaves');

describe('leaves.workingDates', () => {
    test('August 2026: 21 weekdays, minus holidays', () => {
        assert.equal(workingDates('2026-08-01', '2026-08-31').size, 21);
        const w = workingDates('2026-08-01', '2026-08-31', ['2026-08-15', '2026-08-16']); // 15 Aug is a Saturday in 2026
        assert.equal(w.size, 21, 'a holiday on a weekend removes nothing');
        assert.equal(workingDates('2026-08-01', '2026-08-31', [{ date: '2026-08-14' }]).size, 20);
        assert.equal(workingDates('2026-08-01', '2026-08-31', [], [0]).size, 26, 'Sunday-only weekend');
        assert.equal(workingDates('bad', '2026-08-31').size, 0);
    });
});

describe('leaves.summarize', () => {
    const working = workingDates('2026-08-01', '2026-08-31', ['2026-08-14']); // 20 working days
    test('present + leave + absent add up to the working days', () => {
        const present = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-08']; // 8 Aug is a Saturday
        const leaves = [{ date: '2026-08-06', type: 'CL' }, { date: '2026-08-07', type: 'cl' }, { date: '2026-08-10', type: 'SL' }];
        const s = summarize(working, present, leaves);
        assert.equal(s.presentDays, 4, 'Saturday attendance still counts as a present day');
        assert.equal(s.leaveDays, 3);
        assert.deepEqual(s.byType, { CL: 2, SL: 1 });
        assert.equal(s.absentDays, 20 - 3 - 3, 'only weekday presence reduces absence');
    });
    test('a leave on a weekend, a holiday, a scanned day or with an unknown type is ignored', () => {
        const s = summarize(working, ['2026-08-03'], [
            { date: '2026-08-02', type: 'CL' }, // Sunday
            { date: '2026-08-14', type: 'CL' }, // holiday
            { date: '2026-08-03', type: 'CL' }, // attended that day
            { date: '2026-08-04', type: 'XX' }, // unknown type
            { date: '2026-08-05', type: 'EL' }, { date: '2026-08-05', type: 'CL' }, // same day twice
        ]);
        assert.equal(s.leaveDays, 1);
        assert.deepEqual(s.byType, { EL: 1 });
        assert.equal(s.absentDays, 18);
    });
    test('validators', () => {
        assert.equal(isValidLeaveType('cl'), true);
        assert.equal(isValidLeaveType('holiday'), false);
        assert.equal(isValidDate('2026-02-30'), true); // JS rolls it over; the DB rejects it, fine for a format check
        assert.equal(isValidDate('30-02-2026'), false);
    });
});
