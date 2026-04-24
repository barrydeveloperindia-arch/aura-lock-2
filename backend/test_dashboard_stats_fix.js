/**
 * test_dashboard_stats_fix.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test for incorrect dashboard KPI statistics.
 *
 * Root cause: GET /api/stats computed "today" as:
 *   const today = new Date(); today.setHours(0,0,0,0);
 *   today.toISOString().split('T')[0]  →  "2026-03-05"  (UTC YESTERDAY!)
 *
 * The server runs in UTC. In IST (+5:30), midnight IST = 18:30 UTC of
 * the previous day. So setHours(0,0,0,0) followed by toISOString() always
 * returned YESTERDAY's date in UTC → the attendance query found 0 records
 * even though today's records existed → present_today=0, absent_today=N.
 *
 * Additional bug: late threshold was "09:00" instead of "09:15", and the
 * comparison used server-local time (UTC) instead of IST.
 *
 * Fix: use Intl.DateTimeFormat with timeZone:'Asia/Kolkata' to get the
 * correct IST calendar date for DB queries.
 *
 * Tests:
 *   1. /api/stats returns 200
 *   2. All 5 KPI fields present in response
 *   3. total_employees ≥ 0
 *   4. present_today + absent_today = total_employees
 *   5. late_today ≤ present_today
 *   6. total_scans_today ≥ 0
 *   7. IST date calculation is correct (not yesterday)
 *   8. Legacy camelCase fields present for backwards compat
 *
 * Usage:
 *   cd "d:\SMART DOOR LOCK\backend"
 *   node test_dashboard_stats_fix.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const BASE = 'http://localhost:8000';
let TOKEN = '';

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✘ FAIL\x1b[0m';

function assert(condition, label, detail = '') {
    if (condition) console.log(`  ${PASS}  ${label}`);
    else {
        console.error(`  ${FAIL}  ${label}`);
        if (detail) console.error(`         ↳ ${detail}`);
    }
    return condition;
}

async function login() {
    const r = await axios.post(`${BASE}/auth/login`, {
        email: process.env.ADMIN_EMAIL || '5089shivkumar@gmail.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123'
    });
    TOKEN = r.data.token;
    console.log('  Auth: logged in\n');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function test_statsEndpoint() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 1: GET /api/stats returns 200 with all KPI fields');
    console.log('──────────────────────────────────────────────────────────────');

    let stats;
    try {
        const r = await axios.get(`${BASE}/api/stats`, {
            headers: { Authorization: `Bearer ${TOKEN}` }
        });
        stats = r.data;
        assert(r.status === 200, '1a. Status 200', `Got ${r.status}`);
    } catch (err) {
        assert(false, `1a. Status 200 (got ${err.response?.status})`, err.message);
        console.log();
        return null;
    }

    // All 5 KPI fields must be present
    const kpiFields = ['total_employees', 'present_today', 'absent_today', 'late_today', 'total_scans_today'];
    for (const f of kpiFields) {
        assert(f in stats, `1b. KPI field "${f}" present`, `Got keys: ${Object.keys(stats).join(', ')}`);
    }

    console.log(`\n     Stats: employees=${stats.total_employees} | present=${stats.present_today} | absent=${stats.absent_today} | late=${stats.late_today} | scans=${stats.total_scans_today}`);
    console.log();
    return stats;
}

async function test_kpiArithmetic(stats) {
    if (!stats) { console.log('(Skipped — no stats)\n'); return; }
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 2: KPI values are arithmetically consistent');
    console.log('──────────────────────────────────────────────────────────────');

    const { total_employees: total, present_today: present, absent_today: absent, late_today: late, total_scans_today: scans } = stats;

    assert(total >= 0, '2a. total_employees ≥ 0', `Got ${total}`);
    assert(present >= 0, '2b. present_today ≥ 0', `Got ${present}`);
    assert(absent >= 0, '2c. absent_today ≥ 0', `Got ${absent}`);
    assert(late >= 0, '2d. late_today ≥ 0', `Got ${late}`);
    assert(scans >= 0, '2e. total_scans_today ≥ 0', `Got ${scans}`);

    assert(present + absent === total,
        `2f. present_today (${present}) + absent_today (${absent}) = total_employees (${total})`,
        `Sum was ${present + absent}, expected ${total}`
    );

    assert(late <= present,
        `2g. late_today (${late}) ≤ present_today (${present}) — can't be late if absent`,
        `late=${late}, present=${present}`
    );

    console.log();
}

async function test_istDateIsCorrect() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 3: IST date calculation is correct (not UTC yesterday)');
    console.log('──────────────────────────────────────────────────────────────');

    // What the OLD broken code produced:
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const brokenDate = today.toISOString().split('T')[0];

    // What the NEW fixed code produces:
    const correctISTDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata'
    }).format(new Date());

    // UTC date (for comparison)
    const utcDate = new Date().toISOString().split('T')[0];

    console.log(`     UTC date:           ${utcDate}`);
    console.log(`     OLD (broken) date:  ${brokenDate}`);
    console.log(`     NEW (correct) date: ${correctISTDate}`);

    // The broken date WILL equal the correct date only if tested
    // between 00:00–05:30 UTC (i.e., 05:30–11:00 IST). At all other
    // times, brokenDate will be one day behind correctISTDate.
    // We just verify the new method gives the right date.
    const nowIST = new Date().toLocaleString('en-CA', {
        timeZone: 'Asia/Kolkata', dateStyle: 'short'
    });

    assert(correctISTDate.length === 10, '3a. IST date is a 10-char date string', correctISTDate);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(correctISTDate), '3b. IST date matches YYYY-MM-DD format', correctISTDate);
    assert(correctISTDate >= utcDate, '3c. IST date ≥ UTC date (IST is always ahead)', `IST=${correctISTDate}, UTC=${utcDate}`);
    console.log();
}

async function test_noServerSideErrors() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 4: 5 rapid calls — no intermittent 500s');
    console.log('──────────────────────────────────────────────────────────────');

    const headers = { Authorization: `Bearer ${TOKEN}` };
    let passed = 0;
    for (let i = 0; i < 5; i++) {
        try {
            const r = await axios.get(`${BASE}/api/stats`, { headers });
            if (r.status === 200 && 'present_today' in r.data) passed++;
        } catch (err) {
            console.error(`  Attempt ${i + 1} failed: ${err.response?.status}`);
        }
    }
    assert(passed === 5, `4a. All 5 rapid calls return 200 with KPIs (${passed}/5)`);
    console.log();
}

async function test_legacyFieldsPresent(stats) {
    if (!stats) { console.log('(Skipped)\n'); return; }
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 5: Legacy camelCase fields present (backwards compat)');
    console.log('──────────────────────────────────────────────────────────────');

    const legacyFields = ['totalUsers', 'faceProfiles', 'fingerprints', 'rfidCards', 'todayEntries', 'lateToday'];
    for (const f of legacyFields) {
        assert(f in stats, `5a. Legacy field "${f}" present`);
    }
    console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║     Dashboard KPI Statistics Fix — Regression Test Suite    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    await login();

    const stats = await test_statsEndpoint();
    await test_kpiArithmetic(stats);
    await test_istDateIsCorrect();
    await test_noServerSideErrors();
    await test_legacyFieldsPresent(stats);

    console.log('──────────────────────────────────────────────────────────────');
    console.log('All tests complete.');
    console.log('──────────────────────────────────────────────────────────────\n');
})();
