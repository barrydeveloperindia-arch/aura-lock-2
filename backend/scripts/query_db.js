require('dotenv').config();
const supabase = require('../supabase');

async function run() {
    const { data: emps, error: err } = await supabase
        .from('employees')
        .select('*');
    console.log("All Employees:", emps);
    if (err) console.error("Error:", err);
}
run();
