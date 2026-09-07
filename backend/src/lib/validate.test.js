const assert = require('node:assert/strict');
const { isValidEmail, normalizeEmail, isValidEmployeeId } = require('./validate');

describe('isValidEmployeeId', () => {
    test('accepts EMP-### only (the shapes seen in live data are rejected)', () => {
        for (const id of ['EMP-001', 'EMP-047', ' EMP-999 ']) assert.equal(isValidEmployeeId(id), true, id);
        for (const id of ['Emp-023', 'ENG _556', 'Eng006', 'Eng-aaa', 'SKY_11', 'Amresh', 'EMP-1', 'EMP-0001', '', null]) assert.equal(isValidEmployeeId(id), false, String(id));
    });
});

describe('isValidEmail', () => {
    test('accepts ordinary addresses', () => {
        for (const e of ['gauravpanchalenglabs@gmail.com', ' Sunny@Gmail.com ', 'a.b-c+d@sub.example.co.in'])
            assert.equal(isValidEmail(e), true, e);
    });
    test('rejects the shapes found in live data on 7 Sep 2026', () => {
        for (const e of ['sunny@gmail', 'arut@gm', 'arun@gma', 'test@gmail', 'kabir@gmail.', '@gmail.com', 'name@', 'name gmail.com', '', null, undefined, 42])
            assert.equal(isValidEmail(e), false, String(e));
    });
    test('normalizeEmail trims and lower-cases', () => {
        assert.equal(normalizeEmail('  Amresh@Gmail.COM '), 'amresh@gmail.com');
        assert.equal(normalizeEmail(null), '');
    });
});
