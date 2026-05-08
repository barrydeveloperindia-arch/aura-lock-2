const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkEncodings() {
    const target = 'EMP-961231'; // Shiv Kumar
    console.log(`🔍 Checking face_encodings for ${target}...`);

    const { data, error, count } = await supabase
        .from('face_encodings')
        .select('*', { count: 'exact' })
        .eq('employee_id', target);

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log(`📊 Found ${count} encoding(s) for ${target}.`);
        if (data && data.length > 0) {
            console.log("✅ Encoding metadata:", data[0].metadata);
        }
    }
}

checkEncodings();
