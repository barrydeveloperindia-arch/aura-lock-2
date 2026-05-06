const { createClient } = require('@supabase/supabase-js');

async function fullSync() {
    const srcUrl = 'https://wdtizlzfsijikcejerwq.supabase.co';
    const srcKey = 'sb_publishable_mMAzoDNSv_f4SHubPuVxUg_3Xr0KbzQ';
    const destUrl = 'https://ngprtoaoqqrscbjbahpb.supabase.co';
    const destKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncHJ0b2FvcXFyc2NiamJhaHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzI0MjcsImV4cCI6MjA5MjUwODQyN30.zWWUosJZgPWy6vXD6uV94Q50PsABb1ot8bl6KMX5WME';

    const srcSupabase = createClient(srcUrl, srcKey);
    const destSupabase = createClient(destUrl, destKey);

    // 1. Get employees with embeddings from source
    const { data: srcEmps } = await srcSupabase.from('employees').select('*').not('face_embedding', 'is', null);
    
    console.log(`Found ${srcEmps.length} employees to migrate with face data.`);

    for (const emp of srcEmps) {
        console.log(`Processing ${emp.employee_id} (${emp.name})...`);
        
        // 2. Check if employee exists in destination
        const { data: existing } = await destSupabase.from('employees').select('id').eq('employee_id', emp.employee_id).single();
        
        if (!existing) {
            console.log(`Creating employee ${emp.employee_id} in destination...`);
            const { error: insErr } = await destSupabase.from('employees').insert({
                employee_id: emp.employee_id,
                name: emp.name,
                email: emp.email || `${emp.employee_id.toLowerCase()}@auralock.com`,
                department: emp.department || 'General',
                status: emp.status || 'Active',
                face_embedding: emp.face_embedding
            });
            if (insErr) {
                console.error(`Failed to create ${emp.employee_id}:`, insErr.message);
                continue;
            }
        } else {
            // Update existing
            await destSupabase.from('employees').update({ face_embedding: emp.face_embedding }).eq('employee_id', emp.employee_id);
        }

        // 3. Upsert into face_encodings
        const { error: encErr } = await destSupabase.from('face_encodings').upsert({
            employee_id: emp.employee_id,
            embedding: emp.face_embedding,
            created_at: new Date().toISOString()
        });

        if (encErr) {
            console.error(`Failed face_encodings for ${emp.employee_id}:`, encErr.message);
        } else {
            console.log(`✅ Fully migrated ${emp.employee_id}`);
        }
    }
}

fullSync();
