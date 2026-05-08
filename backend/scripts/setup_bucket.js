const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '../backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function setupBucket() {
    console.log("📦 Checking for 'biometrics' bucket...");

    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
        console.error("❌ Error listing buckets:", listError.message);
        return;
    }

    const exists = buckets.find(b => b.name === 'biometrics');

    if (exists) {
        console.log("✅ 'biometrics' bucket already exists.");
    } else {
        console.log("🏗️ Creating 'biometrics' bucket...");
        const { data, error } = await supabase.storage.createBucket('biometrics', {
            public: true,
            allowedMimeTypes: ['image/jpeg', 'image/png'],
            fileSizeLimit: 5242880 // 5MB
        });

        if (error) {
            console.error("❌ Failed to create bucket:", error.message);
            console.log("💡 You might need to create it manually in the Supabase Dashboard -> Storage.");
        } else {
            console.log("✅ Bucket created successfully!");
        }
    }
}

setupBucket();
