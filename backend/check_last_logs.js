const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLogs() {
    const { data, error } = await supabase
        .from('access_logs')
        .select('*, employees(name)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    console.log('Last 5 Access Logs:');
    console.table(data.map(l => ({
        time: l.created_at,
        name: l.employees?.name || 'Unknown',
        status: l.status,
        method: l.method,
        device: l.device_id
    })));
}

checkLogs();
