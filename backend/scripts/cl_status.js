/**
 * One-shot answer for "CL / timesheet / kya pending hai" questions.
 *
 *   node scripts/cl_status.js            # this month
 *   node scripts/cl_status.js 2026-08    # a given month
 *
 * Prints, per active employee: present / absent / late / CL used / CL balance
 * for the month (from the live monthly report), plus today's headcount and
 * anything the system is still waiting on. Reads only; nothing is written.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const BASE = process.env.LIVE_BACKEND_URL || 'https://auralock-backend-tjpy7sonwq-el.a.run.app';
const arg = process.argv[2];
const ist = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const today = ist(new Date());
const [year, month] = (arg && /^\d{4}-\d{2}$/.test(arg) ? arg : today.slice(0, 7)).split('-').map(Number);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pad = (s, n) => String(s).padEnd(n);

(async () => {
    const login = await axios.post(BASE + '/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }, { timeout: 60000 });
    const H = { Authorization: 'Bearer ' + login.data.token };
    const get = (u, params) => axios.get(BASE + u, { headers: H, params, timeout: 120000, validateStatus: () => true });

    const mr = await get('/api/attendance/monthly-report', { month, year });
    if (mr.status !== 200) throw new Error('monthly report ' + mr.status);
    const rows = (mr.data.data || []).sort((a, b) => a.name.trim().localeCompare(b.name.trim()));
    console.log(`MONTH ${year}-${String(month).padStart(2, '0')} | working days ${mr.data.workingDaysInMonth} | holidays ${(mr.data.holidays || []).map(h => h.date.slice(5) + ' ' + h.name).join(', ') || 'none'}`);
    console.log(pad('Name', 22) + pad('ID', 9) + 'Present  Absent  Late  CL used  CL bal   source');
    for (const r of rows) {
        console.log(pad(r.name.trim(), 22) + pad(r.employee_id, 9) + pad(r.presentDays, 9) + pad(r.absentDays, 8) + pad(r.lateDays, 6) + pad(r.cl ?? 0, 9) + pad(r.cl_balance == null ? '—' : r.cl_balance, 9) + (r.cl_source || ''));
    }

    const loc = await get('/api/attendance/locations', { date: today });
    const t = loc.data.rows || [];
    const { count: active } = await sb.from('employees').select('*', { count: 'exact', head: true }).eq('is_deleted', false).eq('status', 'Active');
    console.log(`\nTODAY ${today}: present ${t.length} / ${active} active | in now ${t.filter(r => !r.check_out).length} | late ${t.filter(r => r.status === 'LATE').length} | not yet in ${active - t.length}`);

    const pending = [];
    for (const table of ['leaves', 'holidays', 'leave_ledger']) {
        const r = await sb.from(table).select('*', { count: 'exact', head: true });
        if (r.error) pending.push(`${table} table not reachable via API (${r.error.code}) - leave figures unavailable`);
    }
    if (rows.every(r => r.cl_balance == null)) pending.push('no CL ledger data for this month yet (import pending or table not visible)');
    const dupes = await get('/api/attendance', { date: today, pageSize: 1 });
    if (dupes.status !== 200) pending.push('attendance API not answering');
    console.log('\nPENDING: ' + (pending.length ? '\n  - ' + pending.join('\n  - ') : 'nothing'));
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
