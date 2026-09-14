-- Migration v10 (14 Sep 2026): approval status on each leave day, matching the company's
-- printed Leave Application Form (Admin/Supervisor Approval: Approved / Rejected).
-- Run once in the Supabase SQL editor. Additive only.
--
-- Existing rows backfill to 'Approved' (they were already recorded as taken);
-- new leaves the admin panel adds start as 'Pending' until approved or rejected.
--
-- Safe to run even if an earlier version of this column (without 'Rejected') already
-- exists: the table has no real leave data yet, so this drops and recreates the column.

ALTER TABLE public.leaves DROP COLUMN IF EXISTS status;
ALTER TABLE public.leaves
    ADD COLUMN status text NOT NULL DEFAULT 'Approved'
    CHECK (status IN ('Pending', 'Approved', 'Rejected'));

NOTIFY pgrst, 'reload schema';

SELECT status, count(*) FROM public.leaves GROUP BY status;
