const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function runTest() {
    console.log('--- Biometric API End-to-End Test ---');

    // 1. Check Health
    try {
        const health = await axios.get('http://localhost:8001/health');
        console.log('✅ Health Check:', health.data);
    } catch (err) {
        console.error('❌ Health Check Failed:', err.message);
        process.exit(1);
    }

    // 2. Fetch User Image for Testing
    console.log('Fetching test image for EMP-961231...');
    const { data: user, error } = await supabase
        .from('employees')
        .select('image_url, name')
        .eq('employee_id', 'EMP-961231')
        .single();

    if (error || !user.image_url) {
        console.error('❌ Could not fetch test user or image_url');
        process.exit(1);
    }

    // 3. Download Image
    console.log(`Downloading image: ${user.image_url}`);
    const imageRes = await axios.get(user.image_url, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageRes.data);

    // 4. Submit to Verify Endpoint
    console.log('Submitting for face verification...');
    const form = new FormData();
    form.append('file', imageBuffer, { filename: 'test_face.jpg', contentType: 'image/jpeg' });

    try {
        const verifyRes = await axios.post('http://localhost:8001/api/biometrics/face/verify', form, {
            headers: form.getHeaders()
        });
        console.log('✅ Verification Result:', verifyRes.data);

        if (verifyRes.data.success && verifyRes.data.employee_id === 'EMP-961231') {
            console.log(`🏆 MATCH SUCCESSFUL: Found ${user.name}`);
        } else {
            console.error('❌ Match Failed or Unexpected Result');
        }
    } catch (err) {
        console.error('❌ Verification Request Failed:', err.response ? err.response.data : err.message);
    }
}

runTest();
