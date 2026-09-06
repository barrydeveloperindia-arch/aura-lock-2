/**
 * One-time setup: create the PRIVATE `attendance-photos` bucket.
 *
 *   node setup_attendance_photos.js
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_KEY in backend/.env (the anon /
 * publishable key is blocked by storage RLS). Idempotent: re-running just
 * confirms the bucket exists. Equivalent SQL lives in
 * supabase/migration_v6_attendance_photos.sql if you prefer the dashboard.
 */
require('dotenv').config({ path: __dirname + '/.env', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.ATTENDANCE_PHOTO_BUCKET || 'attendance-photos';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in backend/.env');
    console.error('Get the service_role / secret key from Supabase Dashboard -> Project Settings -> API Keys.');
    process.exit(1);
}

(async () => {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
        console.error('Cannot list buckets:', listErr.message);
        process.exit(1);
    }

    const existing = buckets.find(b => b.name === BUCKET);
    if (existing) {
        console.log(`Bucket "${BUCKET}" already exists (public=${existing.public}).`);
        if (existing.public) {
            console.warn('WARNING: bucket is PUBLIC. Staff photos should be private. Fix in Dashboard -> Storage -> bucket settings.');
        }
        process.exit(0);
    }

    const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        allowedMimeTypes: ['image/jpeg', 'application/json'],
        fileSizeLimit: 2 * 1024 * 1024,
    });
    if (error) {
        console.error('Failed to create bucket:', error.message);
        process.exit(1);
    }
    console.log(`Created private bucket "${BUCKET}" (JPEG + JSON sidecar, 2 MB limit).`);
})();
