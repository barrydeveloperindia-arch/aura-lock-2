-- Migration v10 (14 Sep 2026): approval status on each leave day.
-- Run once in the Supabase SQL editor. Additive only.
--
-- Existing rows backfill to 'Approved' (they were already recorded as taken);
-- new leaves the admin panel adds start as 'Pending' until approved.

ALTER TABLE public.leaves
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Approved'
    CHECK (status IN ('Pending', 'Approved'));

NOTIFY pgrst, 'reload schema';

SELECT status, count(*) FROM public.leaves GROUP BY status;
