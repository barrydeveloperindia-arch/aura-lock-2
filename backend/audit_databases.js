const { createClient } = require('@supabase/supabase-js');

async function auditDB(url, key, name) {
    const supabase = createClient(url, key);
    try {
        const { count: empCount } = await supabase.from('employees').select('*', { count: 'exact', head: true });
        const { count: faceCount } = await supabase.from('face_encodings').select('*', { count: 'exact', head: true });
        console.log(`[${name}] URL: ${url}`);
        console.log(`[${name}] Employees: ${empCount}`);
        console.log(`[${name}] Face Encodings: ${faceCount}`);
    } catch (err) {
        console.error(`[${name}] Error: ${err.message}`);
    }
}

const key1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncHJ0b2FvcXFyc2NiamJhaHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzI0MjcsImV4cCI6MjA5MjUwODQyN30.zWWUosJZgPWy6vXD6uV94Q50PsABb1ot8bl6KMX5WME';
const url1 = 'https://ngprtoaoqqrscbjbahpb.supabase.co';

const key2 = 'sb_publishable_mMAzoDNSv_f4SHubPuVxUg_3Xr0KbzQ';
const url2 = 'https://wdtizlzfsijikcejerwq.supabase.co';

async function run() {
    await auditDB(url1, key1, 'PROJECT_NGP');
    await auditDB(url2, key2, 'PROJECT_WDT');
}

run();
