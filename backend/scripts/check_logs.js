const supabase = require('./supabase');

async function check() {
    console.log("🔍 Checking latest access logs...");
    // Try both created_at or just selecting all to see columns
    const { data, error } = await supabase
        .from('access_logs')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log("✅ Sample Row:", JSON.stringify(data[0], null, 2));
        
        // Now get last 5
        const { data: last5 } = await supabase
            .from('access_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);
        console.log("✅ Last 5 Logs:", JSON.stringify(last5, null, 2));
    }
}

check();
