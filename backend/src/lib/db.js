/**
 * Small database helpers shared by controllers.
 */
const PAGE = 1000; // PostgREST silently caps un-ranged selects at 1000 rows

/**
 * Fetch every row of a query, however many there are.
 * `build` must return a FRESH query builder each time it is called
 * (a supabase-js builder can only be awaited once), e.g.
 *   fetchAll(() => supabase.from('attendance').select('*').gte('date', from))
 * @returns {Promise<any[]>} throws on the first Supabase error
 */
async function fetchAll(build) {
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw error;
        if (data && data.length) rows.push(...data);
        if (!data || data.length < PAGE) break;
    }
    return rows;
}

/**
 * Insert an access_logs row that the schema will accept.
 * The table has NO `method` column (it lives in metadata.method); inserts that
 * carried it were being rejected by PostgREST and silently dropped for months.
 * Never throws; returns true when the row was written.
 */
async function logAccess(supabase, { employee_id = null, status = 'failed', confidence = null, device_id = 'terminal_01', method, metadata = {} } = {}) {
    const row = {
        employee_id,
        status,
        confidence,
        device_id,
        metadata: { ...(method ? { method: String(method).toUpperCase() } : {}), ...metadata },
    };
    try {
        const { error } = await supabase.from('access_logs').insert(row);
        if (error) { console.error('[access_logs] insert rejected:', error.message, JSON.stringify(row)); return false; }
        return true;
    } catch (err) {
        console.error('[access_logs] insert failed:', err.message);
        return false;
    }
}

/** Escape LIKE wildcards so an ID such as Eng_dharm matches literally. */
function likeLiteral(s) {
    return String(s).replace(/[%_\\]/g, (c) => `\\${c}`);
}

module.exports = { fetchAll, logAccess, likeLiteral, PAGE };
