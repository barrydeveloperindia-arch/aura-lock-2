/**
 * "Consistent frames" rule for ambiguous face matches.
 *
 * The engine refuses a frame as AMBIGUOUS when the best match is within the
 * threshold but a second, different employee is almost as close (look-alike
 * colleagues). The terminal keeps scanning every couple of seconds, so a real
 * person in front of the camera produces a run of ambiguous frames that all
 * point at the SAME id, while the odd frame that finally "passes" may pick the
 * wrong look-alike (seen 8 Sep 2026: 20 frames hinted Akshay, then one frame
 * was accepted as Ashish).
 *
 * Rule: N consecutive ambiguous frames from one device, all hinting the same
 * employee, within a short window -> accept that employee. A change of hint or
 * a gap longer than the window resets the run.
 */
const DEFAULT_FRAMES = 3;
const DEFAULT_WINDOW_MS = 20 * 1000;

function createAmbiguityStreak({ frames = DEFAULT_FRAMES, windowMs = DEFAULT_WINDOW_MS } = {}) {
    const runs = new Map(); // device -> { hint, count, lastAt }
    return {
        /** Record an ambiguous frame. Returns the run length when it reaches `frames` (accept), else 0. */
        record(device, hint, now = Date.now()) {
            if (!device || !hint) return 0;
            const run = runs.get(device);
            if (run && run.hint === hint && now - run.lastAt <= windowMs) {
                run.count += 1; run.lastAt = now;
            } else {
                runs.set(device, { hint, count: 1, lastAt: now });
            }
            const r = runs.get(device);
            if (r.count >= frames) { runs.delete(device); return r.count; }
            return 0;
        },
        /** Any non-ambiguous outcome (success, no face, denied) ends the run. */
        reset(device) { runs.delete(device); },
        size() { return runs.size; },
    };
}

module.exports = { createAmbiguityStreak, DEFAULT_FRAMES, DEFAULT_WINDOW_MS };
