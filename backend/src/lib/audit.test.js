const assert = require('node:assert/strict');
const { maskValue, diffFields, actorOf } = require('./audit');

describe('audit.maskValue', () => {
    test('keeps only the last 4 letters/digits, preserving separators', () => {
        assert.equal(maskValue('3580 4346 4256'), '•••• •••• 4256');
        assert.equal(maskValue('JIKPS3830K'), '••••••830K');
        assert.equal(maskValue('10177898202'), '•••••••8202');
    });
    test('empty values stay null', () => {
        assert.equal(maskValue(''), null);
        assert.equal(maskValue(null), null);
        assert.equal(maskValue(undefined), null);
    });
});

describe('audit.diffFields', () => {
    const before = { name: 'Ram Kumar', department: 'Workshop', aadhaar_number: null, contact_number: '8727857406' };
    test('records only fields that actually changed', () => {
        const d = diffFields(before, { name: 'Rampreet Singh', department: 'Workshop', contact_number: '8727857406' });
        assert.deepEqual(d, { name: { from: 'Ram Kumar', to: 'Rampreet Singh' } });
    });
    test('sensitive fields are masked on both sides, never stored in full', () => {
        const d = diffFields(before, { aadhaar_number: '2781 3294 4999' });
        assert.deepEqual(d, { aadhaar_number: { from: null, to: '•••• •••• 4999' } });
        assert.ok(!JSON.stringify(d).includes('2781'));
    });
    test('ignores biometric and bookkeeping fields', () => {
        assert.deepEqual(diffFields(before, { face_embedding: [1, 2], updated_at: 'x', fingerprint_registered: true }), {});
    });
    test('treats null and empty string as the same "no value"', () => {
        assert.deepEqual(diffFields({ blood_group: null }, { blood_group: '' }), {});
    });
});

describe('audit.actorOf', () => {
    test('prefers email, then name, else unknown', () => {
        assert.equal(actorOf({ user: { email: 'admin@auralock.com', name: 'Super Admin' } }), 'admin@auralock.com');
        assert.equal(actorOf({ user: { name: 'Super Admin' } }), 'Super Admin');
        assert.equal(actorOf({}), 'unknown');
    });
});
