-- Migration v14 (15 Sep 2026): PAN and Aadhaar number fields on staff profiles, per explicit
-- request (previously excluded in migration_v12 over transcription-accuracy risk -- user
-- confirmed they want these added regardless).
--
-- No field-level encryption or masking is added here; these values sit in the employees table
-- like every other column, under the same access as the rest of this database.
--
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS aadhaar_number text;

NOTIFY pgrst, 'reload schema';
