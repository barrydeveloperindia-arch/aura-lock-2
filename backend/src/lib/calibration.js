/**
 * Face-threshold calibration maths (pure, no I/O).
 *
 * The engine compares a live frame with every enrolled face and reports the
 * smallest distance (dlib 128-d Euclidean: 0 = identical, ~0.6 is the usual
 * "same person" limit, strangers land higher). During a calibration session
 * each measurement is labelled with who was really in front of the camera
 * ("claimed_id", empty for a visitor). From those rows we derive:
 *
 *   genuine   = claimed person and the engine's best match agree  -> distance should be LOW
 *   impostor  = visitor (no claimed id) or the engine picked someone else -> distance should be HIGH
 *
 * and pick the threshold that separates them, preferring to reject a genuine
 * scan over accepting an impostor (a locked-out colleague retries; a stranger
 * inside is an incident).
 */
const FALSE_ACCEPT_WEIGHT = 3;
const CANDIDATES = []; for (let t = 0.30; t <= 0.95 + 1e-9; t += 0.01) CANDIDATES.push(Math.round(t * 100) / 100);

const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const round = (x, d = 3) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const stats = (arr) => {
    if (!arr.length) return { n: 0, min: null, max: null, mean: null, p95: null };
    const s = [...arr].sort((a, b) => a - b);
    const p95 = s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
    return { n: s.length, min: round(s[0]), max: round(s[s.length - 1]), mean: round(s.reduce((a, b) => a + b, 0) / s.length), p95: round(p95) };
};

/** Split labelled rows into genuine / impostor distances. */
function classify(rows) {
    const genuine = [], impostor = [], misidentified = [], noFace = [];
    for (const r of rows || []) {
        if (!r || r.face_found === false || num(r.distance) == null) { noFace.push(r); continue; }
        const d = num(r.distance);
        const claimed = String(r.claimed_id || '').trim().toUpperCase();
        const matched = String(r.matched_id || '').trim().toUpperCase();
        if (!claimed) impostor.push(d);                 // visitor: any match is a false accept candidate
        else if (claimed === matched) genuine.push(d);  // right person recognised
        else { impostor.push(d); misidentified.push(r); } // wrong person: same risk as a stranger
    }
    return { genuine, impostor, misidentified, noFace };
}

/**
 * Suggest a threshold from labelled rows.
 * @returns {{threshold:number|null, clean_gap:boolean, false_rejects:number, false_accepts:number, reason:string}}
 */
function suggestThreshold(genuine, impostor) {
    if (genuine.length === 0) return { threshold: null, clean_gap: false, false_rejects: 0, false_accepts: 0, reason: 'No genuine measurements yet.' };
    const gMax = Math.max(...genuine);
    if (impostor.length === 0) {
        // no impostor data: leave headroom above the worst genuine scan, but never looser than dlib's usual 0.6
        const t = Math.min(0.6, round(gMax + 0.05, 2));
        return { threshold: t, clean_gap: false, false_rejects: genuine.filter(d => d > t).length, false_accepts: 0, reason: 'No visitor / impostor scans yet: set just above the worst genuine scan, capped at 0.60.' };
    }
    const iMin = Math.min(...impostor);
    if (iMin > gMax) {
        const t = round((gMax + iMin) / 2, 2);
        return { threshold: t, clean_gap: true, false_rejects: 0, false_accepts: 0, reason: `Clean gap: worst genuine ${round(gMax)} < best impostor ${round(iMin)}; midpoint.` };
    }
    // overlap: fewest weighted errors; several thresholds usually tie, take the middle of that
    // plateau so there is margin on both sides (the strictest tie would fail tomorrow's slightly worse scan)
    const scored = CANDIDATES.map(t => {
        const fr = genuine.filter(d => d > t).length;
        const fa = impostor.filter(d => d <= t).length;
        return { t, fr, fa, cost: fr + FALSE_ACCEPT_WEIGHT * fa };
    });
    const minCost = Math.min(...scored.map(x => x.cost));
    const plateau = scored.filter(x => x.cost === minCost);
    const best = plateau[Math.floor(plateau.length / 2)];
    return { threshold: best.t, clean_gap: false, false_rejects: best.fr, false_accepts: best.fa, reason: `Overlap between genuine and impostor scans; ${best.t} gives ${best.fr} false reject(s) and ${best.fa} false accept(s) on this data.` };
}

/** Full report for the calibration page. */
function buildReport(rows, currentThreshold) {
    const { genuine, impostor, misidentified, noFace } = classify(rows);
    const suggestion = suggestThreshold(genuine, impostor);
    const perEmployee = {};
    for (const r of rows || []) {
        if (!r || num(r.distance) == null) continue;
        const key = String(r.claimed_id || '').trim().toUpperCase() || 'VISITOR';
        const e = perEmployee[key] || (perEmployee[key] = { employee_id: key, name: r.claimed_name || (key === 'VISITOR' ? 'Visitor / not enrolled' : key), distances: [], correct: 0, wrong: 0 });
        e.distances.push(num(r.distance));
        if (key === 'VISITOR') continue;
        if (String(r.matched_id || '').toUpperCase() === key) e.correct++; else e.wrong++;
    }
    const cur = num(currentThreshold);
    const employees = Object.values(perEmployee).map(e => ({
        ...e, ...stats(e.distances), distances: undefined,
        pass_now: cur == null || e.employee_id === 'VISITOR' ? null : e.distances.filter(d => d <= cur).length,
        pass_suggested: suggestion.threshold == null || e.employee_id === 'VISITOR' ? null : e.distances.filter(d => d <= suggestion.threshold).length,
        scans: e.distances.length,
    })).sort((a, b) => a.employee_id.localeCompare(b.employee_id));
    return {
        total: (rows || []).length,
        no_face: noFace.length,
        genuine: stats(genuine),
        impostor: stats(impostor),
        misidentified: misidentified.length,
        current_threshold: cur,
        current_false_accepts: cur == null ? null : impostor.filter(d => d <= cur).length,
        current_false_rejects: cur == null ? null : genuine.filter(d => d > cur).length,
        suggestion,
        employees,
    };
}

module.exports = { classify, suggestThreshold, buildReport, stats };
