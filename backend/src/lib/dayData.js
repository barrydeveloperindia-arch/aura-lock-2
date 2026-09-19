/** One place that loads a day's raw rows (employees, attendance, leaves, holidays). */
const supabase = require('../../supabase');

async function loadDay(date) {
    const empQuery = (cols) => supabase.from('employees').select(cols).eq('is_deleted', false).eq('status', 'Active');
    let empRes = await empQuery('id, employee_id, name, department, company, status, email, notify_email, joining_date, last_working_day');
    // Before migration_v21 the notify_email column does not exist: keep working without it.
    if (empRes.error) empRes = await empQuery('id, employee_id, name, department, company, status, email, joining_date, last_working_day');
    const [emps, att, lv, hol] = await Promise.all([
        Promise.resolve(empRes),
        supabase.from('attendance').select('employee_id, check_in, status').eq('date', date).not('check_in', 'is', null),
        supabase.from('leaves').select('employee_id, type, status').eq('date', date),
        supabase.from('holidays').select('date, name').eq('date', date),
    ]);
    if (emps.error) throw emps.error;
    if (att.error) throw att.error;
    // Leave/holiday tables may not exist on a fresh database: treat as empty.
    return { employees: emps.data || [], attendance: att.data || [], leaves: lv.error ? [] : (lv.data || []), holidays: hol.error ? [] : (hol.data || []) };
}

module.exports = { loadDay };
