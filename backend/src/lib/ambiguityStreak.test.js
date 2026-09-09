const assert = require('node:assert/strict');
const { createAmbiguityStreak } = require('./ambiguityStreak');

describe('ambiguityStreak', () => {
    test('three consecutive frames hinting the same person within the window are accepted', () => {
        const s = createAmbiguityStreak({ frames: 3, windowMs: 20000 });
        assert.equal(s.record('t1', 'EMP-046', 1000), 0);
        assert.equal(s.record('t1', 'EMP-046', 3000), 0);
        assert.equal(s.record('t1', 'EMP-046', 5000), 3, 'third frame accepts');
        assert.equal(s.size(), 0, 'run is consumed');
        assert.equal(s.record('t1', 'EMP-046', 7000), 0, 'a new run starts afresh');
    });
    test('a different hint or a long gap resets the run', () => {
        const s = createAmbiguityStreak({ frames: 3, windowMs: 20000 });
        s.record('t1', 'EMP-046', 1000); s.record('t1', 'EMP-046', 3000);
        assert.equal(s.record('t1', 'EMP-045', 5000), 0, 'hint flipped: not accepted');
        assert.equal(s.record('t1', 'EMP-045', 7000), 0);
        assert.equal(s.record('t1', 'EMP-045', 9000), 3, 'consistent again');
        s.record('t1', 'EMP-018', 20000); s.record('t1', 'EMP-018', 22000);
        assert.equal(s.record('t1', 'EMP-018', 22000 + 21000), 0, 'gap beyond the window restarts the count');
    });
    test('devices are independent and a non-ambiguous outcome resets', () => {
        const s = createAmbiguityStreak({ frames: 2 });
        s.record('door', 'EMP-030', 1000);
        assert.equal(s.record('phone', 'EMP-030', 1500), 0, 'other device has its own run');
        s.reset('door');
        assert.equal(s.record('door', 'EMP-030', 2000), 0, 'reset cleared the first frame');
        assert.equal(s.record('door', 'EMP-030', 3000), 2);
        assert.equal(s.record('', 'EMP-030'), 0); assert.equal(s.record('door', ''), 0);
    });
});
