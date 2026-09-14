-- Migration v11 (14 Sep 2026): who approved/rejected a leave, matching the printed Leave
-- Application Form's "Admin / Supervisor Approval ... Signature" line.
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.leaves ADD COLUMN IF NOT EXISTS approved_by text;

NOTIFY pgrst, 'reload schema';
