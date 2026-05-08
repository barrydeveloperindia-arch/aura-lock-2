const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
    console.log("🔍 Checking Supabase tables...");

    const tables = ['employees', 'access_logs', 'users'];

    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`❌ Table '${table}': ${error.message}`);
        } else {
            console.log(`✅ Table '${table}': Exists (Found ${count || 0} rows)`);
        }
    }
}

checkSchema();
