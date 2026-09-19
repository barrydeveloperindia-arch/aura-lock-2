/**
 * Privileged Supabase client for tables that must NOT be reachable with the public anon key
 * (row-level security on, no policies), e.g. audit_log. Falls back to the normal client when
 * no service key is configured (local dev), so nothing breaks — writes just need RLS off there.
 */
const { createClient } = require('@supabase/supabase-js');
const anon = require('../../supabase');

const url = process.env.SUPABASE_URL || 'https://ngprtoaoqqrscbjbahpb.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

module.exports = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : anon;
