const assert = require('node:assert/strict');
const { classify, suggestThreshold, buildReport } = require('./calibration');

const row = (claimed, matched, distance, extra = {}) => ({ claimed_id: claimed, matched_id: matched, distance, ...extra });

describe('calibration.classify', () => {
    test('genuine = claimed matches, impostor = visitor or wrong person, no-face rows set aside', () => {
        const c = classify([
            row('EMP-012', 'EMP-012', 0.42), row('emp-012', 'EMP-012', 0.47),
            row('', 'EMP-007', 0.71), row('EMP-013', 'EMP-006', 0.58),
            { claimed_id: 'EMP-013', face_found: false },
        ]);
        assert.deepEqual(c.genuine, [0.42, 0.47]);
        assert.deepEqual(c.impostor, [0.71, 0.58]);
        assert.equal(c.misidentified.length, 1);
        assert.equal(c.noFace.length, 1);
    });
});

describe('calibration.suggestThreshold', () => {
    test('clean gap -> midpoint', () => {
        const s = suggestThreshold([0.38, 0.45, 0.50], [0.66, 0.72]);
        assert.equal(s.threshold, 0.58);
        assert.equal(s.clean_gap, true);
        assert.equal(s.false_accepts, 0);
    });
    test('overlap -> fewest weighted errors, false accepts cost 3x', () => {
        const s = suggestThreshold([0.40, 0.45, 0.62], [0.55, 0.70]);
        // cost 1 (one false reject, 0.62) for every t in 0.45..0.54; the middle of that plateau is chosen
        assert.equal(s.threshold, 0.5);
        assert.equal(s.false_rejects, 1);
        assert.equal(s.false_accepts, 0);
    });
    test('no impostor data -> just above worst genuine, capped at 0.60', () => {
        assert.equal(suggestThreshold([0.40, 0.48], []).threshold, 0.53);
        assert.equal(suggestThreshold([0.40, 0.70], []).threshold, 0.6);
        assert.equal(suggestThreshold([], []).threshold, null);
    });
});

describe('calibration.buildReport', () => {
    test('per-employee pass counts under the current and suggested thresholds', () => {
        const r = buildReport([
            row('EMP-012', 'EMP-012', 0.42, { claimed_name: 'Gaurav' }), row('EMP-012', 'EMP-012', 0.55, { claimed_name: 'Gaurav' }),
            row('', 'EMP-007', 0.75),
        ], 0.90);
        assert.equal(r.total, 3);
        assert.equal(r.current_false_accepts, 1, 'the visitor passes at 0.90');
        assert.equal(r.suggestion.threshold, 0.65);
        const g = r.employees.find(e => e.employee_id === 'EMP-012');
        assert.equal(g.scans, 2); assert.equal(g.correct, 2); assert.equal(g.max, 0.55);
        assert.equal(g.pass_now, 2); assert.equal(g.pass_suggested, 2);
        const v = r.employees.find(e => e.employee_id === 'VISITOR');
        assert.equal(v.pass_now, null);
    });
});
