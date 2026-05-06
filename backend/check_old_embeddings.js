const { createClient } = require('@supabase/supabase-js');

async function checkOldData() {
    const key = 'sb_publishable_mMAzoDNSv_f4SHubPuVxUg_3Xr0KbzQ';
    const url = 'https://wdtizlzfsijikcejerwq.supabase.co';
    const supabase = createClient(url, key);
    
    const { data: emps, error } = await supabase.from('employees').select('employee_id, name, face_embedding');
    if (error) {
        console.error('Error:', error);
        return;
    }
    
    const withEmbeds = emps.filter(e => e.face_embedding);
    console.log(`Found ${emps.length} employees total.`);
    console.log(`Found ${withEmbeds.length} employees with embeddings in PROJECT_WDT.`);
    if (withEmbeds.length > 0) {
        console.log('Sample IDs:', withEmbeds.slice(0, 5).map(e => e.employee_id));
    }
}

checkOldData();
