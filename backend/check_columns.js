const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkSchema() {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching one record:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('Available Columns:', Object.keys(data[0]));
        console.log('Sample Data for EMP-961231 context:', data[0].employee_id);
    } else {
        console.log('No data found in employees table.');
    }
}

checkSchema();
