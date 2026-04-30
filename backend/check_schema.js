const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);


async function checkSchema() {
    console.log("Checking schema for 'access_logs'...");
    const { data: logData, error: logError } = await supabase.from('access_logs').select('*').limit(1);
    if (logError) {
        console.error("Access Logs Error:", logError.message);
    } else {
        console.log("Access Logs Columns:", Object.keys(logData[0] || {}));
    }

    console.log("\nChecking schema for 'attendance'...");
    const { data: attData, error: attError } = await supabase.from('attendance').select('*').limit(1);
    if (attError) {
        console.error("Attendance Error:", attError.message);
    } else {
        console.log("Attendance Columns:", Object.keys(attData[0] || {}));
    }
}

checkSchema();
