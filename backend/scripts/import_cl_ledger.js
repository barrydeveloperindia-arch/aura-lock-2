/**
 * Import the monthly CL ledger from the payroll attendance workbook
 * ("ATTANDENCE APRIL 26_standardized.xlsx": one sheet per month, columns
 * PREV CL / ADD CL / CL USED / PENDING CL) into public.leave_ledger, and the
 * sheet's official holidays into public.holidays.
 *
 *   node scripts/import_cl_ledger.js "C:\Users\SAM\Downloads\ATTANDENCE APRIL 26_standardized.xlsx"           # dry run
 *   node scripts/import_cl_ledger.js "<file>" --apply
 *
 * Only months whose PRESENT DAYS column is filled in are imported as "used"
 * figures; months that only carry an opening balance (e.g. August 2026 at the
 * time of import) are imported with used_cl = 0 and marked source 'sheet-opening'.
 * Nothing is invented: a name that does not match exactly one employee is listed
 * and skipped.
 */
require('dotenv').config({ path: __dirname + '/../.env', quiet: true });
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const FILE = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!FILE) { console.error('usage: node scripts/import_cl_ledger.js <xlsx> [--apply]'); process.exit(1); }
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Sheet name -> month. The workbook's year is in the sheet name ("MAY 26"); APRIL has none.
const MONTHS = { JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12 };
function sheetMonth(name, defaultYear) {
    const m = /^([A-Z]+)\s*(\d{2})?$/i.exec(name.trim());
    if (!m || !MONTHS[m[1].toUpperCase()]) return null;
    const year = m[2] ? 2000 + Number(m[2]) : defaultYear;
    return `${year}-${String(MONTHS[m[1].toUpperCase()]).padStart(2, '0')}-01`;
}
const val = (c) => { const x = c.value; if (x && typeof x === 'object') { if ('result' in x) return x.result; if ('richText' in x) return x.richText.map(t => t.text).join(''); if (x instanceof Date) return x; return null; } return x; };
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

// Sheet spellings that differ from the employee record (checked against the staff list on 9 Sep 2026)
const ALIASES = { KUWARLAL: 'EL021', SHUBHAM: 'EL024' };
/** Resolve a sheet name like "KUWARLAL" to one employee (active or disabled). */
function resolveEmployee(sheetName, employees) {
    const key = String(sheetName).toUpperCase().replace(/[^A-Z]/g, '');
    if (ALIASES[key]) return employees.find(e => e.employee_id === ALIASES[key]) || null;
    const hits = employees.filter(e => {
        const full = e.name.toUpperCase().replace(/[^A-Z ]/g, '');
        const first = full.trim().split(/\s+/)[0];
        return full.replace(/\s/g, '') === key || first === key || full.replace(/\s/g, '').startsWith(key);
    });
    return hits.length === 1 ? hits[0] : (hits.length ? { ambiguous: hits.map(h => `${h.employee_id} ${h.name.trim()}`) } : null);
}

(async () => {
    const { data: employees, error } = await sb.from('employees').select('id, employee_id, name, status, is_deleted');
    if (error) throw error;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);
    const ledger = [], holidays = [], skipped = [];
    const cutoff = new Date().toISOString().slice(0, 7) + '-01'; // future months on the sheet are formula projections, not records
    for (const ws of wb.worksheets) {
        const month = sheetMonth(ws.name, 2026);
        if (!month) continue;
        const future = month > cutoff;
        // header row 3: SR NO | EMPLOYEE | WORKING DAYS | PRESENT DAYS | SUNDAYS | HOLIDAYS | OT HOURS | OT DAYS | REMAIN OT | PREV CL | ADD CL | CL USED | PENDING CL | FINAL TOTAL
        let inHolidayList = false;
        for (let r = 4; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            const name = val(row.getCell(2));
            if (name == null || String(name).trim() === '') continue;
            const text = String(name).trim();
            if (/OFFICIAL HOLIDAY LIST/i.test(text)) { inHolidayList = true; continue; }
            if (inHolidayList) {
                const dateCell = val(row.getCell(2)), holName = val(row.getCell(4));
                if (/^DATE$/i.test(String(dateCell)) || /No official holidays/i.test(String(dateCell))) continue;
                const d = dateCell instanceof Date ? dateCell : new Date(String(dateCell) + ' UTC');
                if (!Number.isNaN(d.getTime()) && holName) holidays.push({ date: d.toISOString().slice(0, 10), name: String(holName).trim() });
                continue;
            }
            const sr = num(val(row.getCell(1)));
            if (sr == null) continue;
            const present = num(val(row.getCell(4)));
            const prev = num(val(row.getCell(10))), add = num(val(row.getCell(11))), used = num(val(row.getCell(12))), pending = num(val(row.getCell(13)));
            const emp = resolveEmployee(text, employees);
            if (!emp || emp.ambiguous) { skipped.push({ sheet: ws.name, name: text, why: emp ? 'ambiguous: ' + emp.ambiguous.join(' / ') : 'no employee found' }); continue; }
            if (future) continue; // holidays below are still read for future months
            const filled = present != null && present > 0; // a month with no attendance entered only carries the opening balance
            if (!filled && (prev == null || Number.isNaN(prev))) { skipped.push({ sheet: ws.name, name: text, why: 'no opening balance on the sheet' }); continue; }
            const opening = prev ?? 0, added = add ?? 0, usedCl = filled ? (used ?? 0) : 0;
            const closing = pending != null && !Number.isNaN(pending) ? pending : opening + added - usedCl;
            ledger.push({ employee_id: emp.id, label: `${emp.employee_id} ${emp.name.trim()}`, month, opening_cl: opening, added_cl: added, used_cl: usedCl, closing_cl: closing, source: filled ? 'sheet' : 'sheet-opening', note: `${ws.name}: working ${num(val(row.getCell(3)))}, present ${present ?? 0}` });
        }
    }
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${ledger.length} ledger rows, ${holidays.length} holidays, ${skipped.length} skipped`);
    for (const l of ledger) console.log(`  ${l.month}  ${l.label.padEnd(26)} open ${String(l.opening_cl).padStart(2)}  +${l.added_cl}  used ${l.used_cl}  bal ${String(l.closing_cl).padStart(2)}  (${l.source})`);
    for (const h of holidays) console.log(`  holiday ${h.date} ${h.name}`);
    for (const s of skipped) console.log(`  SKIP ${s.sheet} ${s.name}: ${s.why}`);
    if (!APPLY) return;
    const rows = ledger.map(({ label, ...r }) => r);
    const { error: e1 } = await sb.from('leave_ledger').upsert(rows, { onConflict: 'employee_id,month' });
    if (e1) throw e1;
    if (holidays.length) { const { error: e2 } = await sb.from('holidays').upsert(holidays, { onConflict: 'date' }); if (e2) throw e2; }
    console.log('imported.');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
