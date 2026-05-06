const { createClient } = require('@supabase/supabase-js');

async function checkEncodings() {
    const key = 'sb_publishable_mMAzoDNSv_f4SHubPuVxUg_3Xr0KbzQ';
    const url = 'https://wdtizlzfsijikcejerwq.supabase.co';
    const supabase = createClient(url, key);
    
    const { data: encs } = await supabase.from('face_encodings').select('employee_id');
    console.log('Registered Face IDs in PROJECT_WDT:', encs.map(e => e.employee_id));
}

checkEncodings();
