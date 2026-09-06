-- Migration v6: attendance photo storage
-- ------------------------------------------------------------
-- Creates the PRIVATE bucket that holds the camera frame captured at every
-- check-in / check-out. No table changes: photos are addressed as
--   <YYYY-MM-DD>/<attendance.id>_<in|out>.jpg
-- The backend reads/writes with the service_role key (bypasses RLS) and hands
-- the dashboard 1-hour signed URLs. Nothing below grants anon/authenticated
-- roles any access, so the bucket stays private by default.
--
-- Run in Supabase Dashboard -> SQL Editor, or use
--   node backend/setup_attendance_photos.js
-- which does the same through the Storage API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-photos', 'attendance-photos', false, 2097152, array['image/jpeg','application/json'])
on conflict (id) do update
    set public = false,
        file_size_limit = 2097152,
        allowed_mime_types = array['image/jpeg','application/json'];
