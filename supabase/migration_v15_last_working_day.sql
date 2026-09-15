-- Migration v15 (15 Sep 2026): last working day field, for employees who have resigned.
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS last_working_day date;

NOTIFY pgrst, 'reload schema';
