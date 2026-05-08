const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectTable() {
    console.log("🔍 Detailed Inspection of 'employees'...");

    // 1. Try to get just one record with all columns
    const { data, error } = await supabase.from('employees').select('*').limit(1);

    if (error) {
        console.error("❌ Inspection Error:", error.message);
        console.error("Error Code:", error.code);
        console.error("Full Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("✅ Successfully reached 'employees' table.");
        if (data && data.length > 0) {
            console.log("📄 Schema Sample (Columns):", Object.keys(data[0]).join(', '));
        } else {
            console.log("📄 Table exists but is currently empty.");
        }
    }

    // 2. Check Storage Buckets
    console.log("\n📦 Checking Storage Buckets...");
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error("❌ Bucket Check Failed:", bucketError.message);
    } else {
        console.log("✅ Found Buckets:", buckets.map(b => b.name).join(', '));
        const biometrics = buckets.find(b => b.name === 'biometrics');
        if (biometrics) {
            console.log("✅ 'biometrics' bucket exists and is public:", biometrics.public);
        } else {
            console.log("❌ 'biometrics' bucket is MISSING!");
        }
    }
}

inspectTable();
