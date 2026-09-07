const assert = require('node:assert/strict');
const { isValidEmail, normalizeEmail } = require('./validate');

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
