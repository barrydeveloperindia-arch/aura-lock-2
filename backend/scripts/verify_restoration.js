const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function verifyRestoration() {
    const { data, error } = await supabase
        .table('employees')
        .select('employee_id, name, face_embedding')
        .eq('employee_id', 'EMP-961231')
        .single();

    if (error) {
        console.error('❌ Error fetching user:', error.message);
        return;
    }

    if (data.face_embedding && Array.isArray(data.face_embedding) && data.face_embedding.length === 128) {
        console.log(`✅ SUCCESS: ${data.name} (${data.employee_id}) has a valid ${data.face_embedding.length}-dimensional encoding.`);
    } else {
        console.error(`❌ FAILURE: ${data.name} has invalid encoding. Length: ${data.face_embedding ? data.face_embedding.length : 'null'}`);
    }
}

verifyRestoration();
