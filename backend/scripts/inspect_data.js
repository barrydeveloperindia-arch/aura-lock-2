const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectData() {
    const { data, error } = await supabase
        .from('employees')
        .select('face_embedding')
        .eq('employee_id', 'EMP-961231')
        .single();

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log('Type of face_embedding:', typeof data.face_embedding);

    let embedding = data.face_embedding;
    if (typeof embedding === 'string') {
        try {
            embedding = JSON.parse(embedding);
            console.log('✅ Parsed successfully from String to Array');
        } catch (e) {
            console.error('❌ JSON Parse failed:', e.message);
        }
    }

    if (Array.isArray(embedding)) {
        console.log('Array Length:', embedding.length);
        console.log('First 3 elements:', embedding.slice(0, 3));
    } else {
        console.error('❌ Data is NOT an array after parsing');
    }
}

inspectData();
