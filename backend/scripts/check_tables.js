const supabase = require('./supabase');

async function check() {
    console.log("🔍 Checking all biometric tables...");
    
    const { data: encodings } = await supabase.from('face_encodings').select('*').limit(1);
    console.log("✅ face_encodings sample:", JSON.stringify(encodings, null, 2));

    const { data: templates } = await supabase.from('face_templates').select('*').limit(1);
    console.log("✅ face_templates sample:", JSON.stringify(templates, null, 2));
}

check();
