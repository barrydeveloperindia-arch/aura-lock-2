const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkLegacyEmbedding() {
    const target = 'EMP-961231';
    console.log(`🔍 Checking legacy face_embedding for ${target}...`);

    const { data, error } = await supabase
        .from('employees')
        .select('name, face_embedding, image_url')
        .eq('employee_id', target)
        .single();

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log(`👤 User: ${data.name}`);
        console.log(`🖼️ Image URL: ${data.image_url}`);
        if (data.face_embedding) {
            console.log(`✅ FOUND legacy face_embedding (Length: ${data.face_embedding.length})`);
            console.log("⚠️ This is likely a MOCK encoding because the Biometric API was offline.");
        } else {
            console.log("❌ No face_embedding found in employees table.");
        }
    }
}

checkLegacyEmbedding();
