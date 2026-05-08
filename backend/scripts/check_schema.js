const supabase = require('./supabase');

async function check() {
    console.log("🔍 Checking face_templates schema...");
    // Since I can't easily run SQL rpc if not defined, I'll just try to insert a dummy row and see the error details or use a select.
    const { data, error } = await supabase
        .from('face_templates')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Error:", error.message);
    } else {
        console.log("✅ Sample Data:", JSON.stringify(data, null, 2));
    }
}

check();
