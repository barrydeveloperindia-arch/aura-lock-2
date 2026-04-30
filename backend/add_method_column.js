const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function addMethodColumn() {
    console.log("🚀 Adding 'method' column to 'access_logs'...");

    // Supabase JS client doesn't support ALTER TABLE directly. 
    // We have to use the RPC or just try to insert and see if it fails, 
    // but usually we use a SQL query via a specialized endpoint if available.
    // However, I can try to use a 'system' level query if I have the right permissions.
    
    // Alternative: Try to see if we can use the 'rpc' method if a 'exec_sql' function exists.
    
    console.log("⚠️ Note: I will attempt to add the column via a SQL-like approach if possible, or I'll recommend the user to add it via Supabase Dashboard if this fails.");

    const { error } = await supabase.rpc('exec_sql', {
        sql_query: "ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'FACE';"
    });

    if (error) {
        console.error("❌ Failed to add column via RPC:", error.message);
        console.log("Trying manual verification of column existence...");
        
        // If RPC is not available, we might need to ask the user to add it manually 
        // OR we can try to use the 'metadata' column which ALREADY EXISTS!
        
        console.log("💡 WORKAROUND: I will update the backend to store the method inside the 'metadata' column, which already exists, and update the frontend to read from it if 'method' is missing.");
    } else {
        console.log("✅ Column 'method' added successfully!");
    }
}

addMethodColumn();
