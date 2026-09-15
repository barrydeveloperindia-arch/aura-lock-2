-- Migration v11 (15 Sep 2026): who approved/rejected a leave, matching the printed Leave
-- Application Form's "Admin / Supervisor Approval ... Signature" line. An array because more
-- than one person can sign off on the same leave (e.g. Bharat sir AND Salil sir).
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.leaves DROP COLUMN IF EXISTS approved_by;
ALTER TABLE public.leaves ADD COLUMN approved_by text[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
