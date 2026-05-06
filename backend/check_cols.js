const supabase = require('./supabase');

async function check() {
    const { data } = await supabase.from('employees').select('*').limit(1);
    console.log("✅ Columns:", Object.keys(data[0]));
}
check();
