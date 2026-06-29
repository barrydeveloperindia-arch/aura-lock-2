// backend/create-admin.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Secure credentials read directly from your project environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Error: Missing configuration keys in .env!");
    process.exit(1);
}

// Service role bypasses standard RLS constraints to directly map core entities
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function bootstrapAdmin() {
    const adminEmail = 'admin@antigravity.io';
    const adminPassword = 'DevPassword2026!'; // Change this immediately for production deployment

    console.log(`⏳ Registering administrative access account for: ${adminEmail}...`);

    const { data, error } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true, // Auto-validates token records instantly
        user_metadata: { role: 'super_admin', name: 'System Root Master' }
    });

    if (error) {
        console.error('❌ User generation failed:', error.message);
    } else {
        console.log('✅ Admin Account Successfully Bootstrapped!');
        console.log(`📧 Email: ${adminEmail}`);
        console.log(`🔒 Password: ${adminPassword}`);
        console.log('👉 Delete this file now to prevent sensitive leaks!');
    }
}

bootstrapAdmin();