const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function testRegistration() {
    try {
        const form = new FormData();
        // create a dummy image buffer
        const buffer = Buffer.alloc(100, "abc");

        form.append('file', buffer, { filename: 'test.jpg', contentType: 'image/jpeg' });
        form.append('employeeId', 'TEST1234');
        form.append('email', 'test@test.com');
        form.append('name', 'Test User');

        console.log("Sending request to http://localhost:8000/api/biometrics/face/register...");

        const response = await axios.post('http://localhost:8000/api/biometrics/face/register', form, {
            headers: form.getHeaders(),
        });

        console.log("Success! Status:", response.status);
        console.log(response.data);
    } catch (e) {
        console.error("ERROR!");
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", e.response.data);
        } else {
            console.error(e.message);
        }
    }
}

testRegistration();
