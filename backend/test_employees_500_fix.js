/**
 * test_employees_500_fix.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test for:
 *   "Request failed with status code 500" on Employees page (GET /api/users)
 *
 * Root cause: GET /api/users selected non-existent columns
 *   `face_registered` and `fingerprint_registered` in the Supabase query.
 *   Supabase returned a column-not-found error → Express caught it → 500 to frontend.
 *
 * What this test verifies:
 *   1. GET /api/users returns HTTP 200 (not 500)
 *   2. Response is a JSON array
 *   3. face_embedding is NOT included (private data stripped server-side)
 *   4. face_registered IS included as a boolean (computed from embedding)
 *   5. fingerprint_registered IS included as a boolean
 *   6. All expected safe fields are present
 *   7. Backend health check returns ok
 *   8. Unauthorized request returns 401 (not 500)
 *
 * Usage:
 *   cd "d:\SMART DOOR LOCK\backend"
 *   node test_employees_500_fix.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios');

const BASE = 'http://localhost:8000';

let TOKEN = '';

const PASS = '\x1b[32m✔ PASS\x1b[0m';
const FAIL = '\x1b[31m✘ FAIL\x1b[0m';

function assert(condition, label, detail = '') {
    if (condition) {
        console.log(`  ${PASS}  ${label}`);
    } else {
        console.error(`  ${FAIL}  ${label}`);
        if (detail) console.error(`         ↳ ${detail}`);
    }
    return condition;
}

async function login() {
    const res = await axios.post(`${BASE}/auth/login`, {
        email: process.env.ADMIN_EMAIL || '5089shivkumar@gmail.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@123'
    });
    TOKEN = res.data.token;
    console.log('  Auth: logged in\n');
}

function authHeaders() { return { Authorization: `Bearer ${TOKEN}` }; }

// ── Tests ─────────────────────────────────────────────────────────────────────

async function test_healthCheck() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 1: Backend health');
    console.log('──────────────────────────────────────────────────────────────');
    try {
        const r = await axios.get(`${BASE}/`);
        assert(r.status === 200, '1a. Root / returns 200', `Got ${r.status}`);
        assert(r.data.status === 'Online', '1b. status = Online', r.data.status);
    } catch (err) {
        assert(false, '1a. Root health check', err.message);
    }
    console.log();
}

async function test_unauthorizedReturns401() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 2: Unauthenticated GET /api/users → 401 (not 500)');
    console.log('──────────────────────────────────────────────────────────────');
    try {
        await axios.get(`${BASE}/api/users`);
        assert(false, '2a. No token → 401 (should have thrown)');
    } catch (err) {
        const code = err.response?.status;
        assert(code === 401, `2a. No token → 401 (got ${code})`, `Full response: ${err.response?.data}`);
    }
    console.log();
}

async function test_getUsersReturns200() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 3: GET /api/users returns 200 with correct shape');
    console.log('──────────────────────────────────────────────────────────────');

    let data;
    try {
        const r = await axios.get(`${BASE}/api/users`, { headers: authHeaders() });
        data = r.data;

        assert(r.status === 200,
            '3a. Status 200 (not 500)',
            `Got: ${r.status}`
        );
        assert(Array.isArray(data),
            '3b. Response body is an array',
            `Got: ${typeof data}`
        );
    } catch (err) {
        const code = err.response?.status || '?';
        const msg = err.response?.data?.message || err.message;
        assert(false, `3a. Status 200 (got ${code}): ${msg}`);
        console.log();
        return;
    }

    if (data.length === 0) {
        console.log('  (No employees in DB — column shape tests skipped)');
        console.log();
        return;
    }

    const user = data[0];
    const keys = Object.keys(user);

    // 3c/d. face_embedding should be absent, face_registered should be present
    assert(!keys.includes('face_embedding'),
        '3c. face_embedding NOT in response (raw vector data stripped)',
        `Keys: ${keys.join(', ')}`
    );
    assert(keys.includes('face_registered'),
        '3d. face_registered IS in response (computed boolean)',
        `Keys: ${keys.join(', ')}`
    );
    assert(typeof user.face_registered === 'boolean',
        '3e. face_registered is a boolean',
        `Got: ${typeof user.face_registered} (${user.face_registered})`
    );
    assert(keys.includes('fingerprint_registered'),
        '3f. fingerprint_registered IS in response',
        `Keys: ${keys.join(', ')}`
    );
    assert(typeof user.fingerprint_registered === 'boolean',
        '3g. fingerprint_registered is a boolean',
        `Got: ${typeof user.fingerprint_registered}`
    );

    // 3h. Check all required column fields are present
    const requiredFields = ['id', 'employee_id', 'name', 'email', 'role', 'status', 'created_at'];
    for (const field of requiredFields) {
        assert(keys.includes(field), `3h. Required field "${field}" present`);
    }

    console.log(`\n     Sample: ${user.name} (${user.employee_id}) face_registered=${user.face_registered}`);
    console.log();
}

async function test_noServerSideError() {
    console.log('──────────────────────────────────────────────────────────────');
    console.log('TEST 4: Multiple rapid calls — no intermittent 500s');
    console.log('──────────────────────────────────────────────────────────────');

    const attempts = 5;
    let passed = 0;
    for (let i = 0; i < attempts; i++) {
        try {
            const r = await axios.get(`${BASE}/api/users`, { headers: authHeaders() });
            if (r.status === 200) passed++;
        } catch (err) {
            console.error(`  Attempt ${i + 1} failed: ${err.response?.status} — ${err.response?.data?.message || err.message}`);
        }
    }

    assert(passed === attempts,
        `4a. All ${attempts} rapid calls return 200 (got ${passed}/${attempts})`,
    );
    console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   Employees 500 Error Fix — Regression Test Suite           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    await login();

    await test_healthCheck();
    await test_unauthorizedReturns401();
    await test_getUsersReturns200();
    await test_noServerSideError();

    console.log('──────────────────────────────────────────────────────────────');
    console.log('All tests complete.');
    console.log('──────────────────────────────────────────────────────────────\n');
})();
