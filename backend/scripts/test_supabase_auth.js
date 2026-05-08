const supabase = require('./supabase');

async function test() {
    console.log("🧪 Testing Supabase Connection...");
    try {
        const { data, error } = await supabase.from('employees').select('count', { count: 'exact', head: true });
        if (error) {
            console.error("❌ Supabase Error:", error.message);
        } else {
            console.log("✅ Supabase Connected! Total employees (count):", data);
        }
    } catch (err) {
        console.error("❌ Critical Error:", err.message);
    }
}

test();
