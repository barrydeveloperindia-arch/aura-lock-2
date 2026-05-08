const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function testSupabase() {
    console.log("🔍 Checking Supabase connection...");
    try {
        const { data, error } = await supabase.from('employees').select('count', { count: 'exact', head: true });
        if (error) {
            console.error("❌ Supabase Error:", error.message);
        } else {
            console.log("✅ Supabase connection successful! Employee count:", data);
        }
    } catch (err) {
        console.error("❌ Connection failed with fatal error:", err.message);
        if (err.message.includes('SSL')) {
            console.log("💡 SSL Issue detected. This might be a transient network problem or proxy issue.");
        }
    }
}

testSupabase();
