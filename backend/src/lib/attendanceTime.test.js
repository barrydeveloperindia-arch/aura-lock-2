/**
 * Regression tests for the timezone / late-rule helpers.
 * These guard the two bugs found in the 7 Sep 2026 audit:
 *  - "today" computed in UTC (scans 00:00–05:29 IST landed on the previous day)
 *  - reports judging "late" against UTC clocks with a different threshold
 */
const t = require('./attendanceTime');

describe('istDateString', () => {
    test('01:30 IST on the 8th is still the 8th, even though it is 20:00 UTC on the 7th', () => {
        expect(t.istDateString(new Date('2026-09-07T20:00:00Z'))).toBe('2026-09-08');
    });
    test('23:30 IST stays on the same day', () => {
        expect(t.istDateString(new Date('2026-09-07T18:00:00Z'))).toBe('2026-09-07');
    });
});

describe('isLateIST / rowIsLate', () => {
    test('09:14 IST is on time, 09:16 IST is late (threshold 09:15)', () => {
        expect(t.isLateIST('2026-09-07T03:44:00Z')).toBe(false); // 09:14 IST
        expect(t.isLateIST('2026-09-07T03:46:00Z')).toBe(true);  // 09:16 IST
    });
    test('an afternoon UTC clock does not fool the rule (14:30 IST is late)', () => {
        expect(t.isLateIST('2026-09-07T09:00:00Z')).toBe(true);
    });
    test('stored status wins over the rule; rule is the fallback', () => {
        expect(t.rowIsLate({ status: 'ON_TIME', check_in: '2026-09-07T09:00:00Z' })).toBe(false);
        expect(t.rowIsLate({ status: 'LATE', check_in: '2026-09-07T03:00:00Z' })).toBe(true);
        expect(t.rowIsLate({ status: null, check_in: '2026-09-07T03:46:00Z' })).toBe(true);
        expect(t.rowIsLate({})).toBe(false);
    });
});

describe('IST day bounds for created_at filters', () => {
    test('7 Sep IST runs from 6 Sep 18:30Z to 7 Sep 18:29:59.999Z', () => {
        expect(t.istDayStartUTC('2026-09-07')).toBe('2026-09-06T18:30:00.000Z');
        expect(t.istDayEndUTC('2026-09-07')).toBe('2026-09-07T18:29:59.999Z');
    });
});

describe('monthRange', () => {
    test('February 2028 (leap) and September 2026', () => {
        expect(t.monthRange('2028', '2')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
        expect(t.monthRange(2026, 9)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    });
    test('rejects garbage instead of throwing a RangeError', () => {
        expect(t.monthRange('abc', '1')).toBeNull();
        expect(t.monthRange('2026', '13')).toBeNull();
    });
});
