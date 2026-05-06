const { createClient } = require('@supabase/supabase-js');

async function checkEncodings() {
    const key1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncHJ0b2FvcXFyc2NiamJhaHBiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzI0MjcsImV4cCI6MjA5MjUwODQyN30.zWWUosJZgPWy6vXD6uV94Q50PsABb1ot8bl6KMX5WME';
    const url1 = 'https://ngprtoaoqqrscbjbahpb.supabase.co';
    const supabase = createClient(url1, key1);
    
    const { data: encs } = await supabase.from('face_encodings').select('employee_id');
    console.log('Registered Face IDs in Cloud:', encs.map(e => e.employee_id));
}

checkEncodings();
