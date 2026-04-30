const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectAccessLogs() {
    console.log("🔍 Detailed Inspection of 'access_logs'...");

    const { data, error } = await supabase.from('access_logs').select('*').limit(1);

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log("✅ Table accessible.");
        if (data && data.length > 0) {
            console.log("📄 Columns:", Object.keys(data[0]).join(', '));
            console.log("📄 Sample Data:", JSON.stringify(data[0], null, 2));
        } else {
            console.log("📄 Table exists but is empty.");
        }
    }
}

inspectAccessLogs();
