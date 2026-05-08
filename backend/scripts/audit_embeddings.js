const { createClient } = require('@supabase/supabase-js');

async function auditDB(url, key, name) {
    const supabase = createClient(url, key);
    try {
        const { data: emps } = await supabase.from('employees').select('name, face_embedding');
        const embedded = emps.filter(e => e.face_embedding).length;
        console.log(`[${name}] URL: ${url}`);
        console.log(`[${name}] Total Employees: ${emps.length}`);
        console.log(`[${name}] Employees with Legacy Embeddings: ${embedded}`);
    } catch (err) {
        console.error(`[${name}] Error: ${err.message}`);
    }
}

const key1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncHJ0b2FvcXFyc2NiamJhaHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzI0MjcsImV4cCI6MjA5MjUwODQyN30.zWWUosJZgPWy6vXD6uV94Q50PsABb1ot8bl6KMX5WME';
const url1 = 'https://ngprtoaoqqrscbjbahpb.supabase.co';

async function run() {
    await auditDB(url1, key1, 'PROJECT_NGP');
}

run();
