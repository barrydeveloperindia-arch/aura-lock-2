-- Migration v16 (15 Sep 2026): remaining "General Details" fields from the Tally register --
-- date of birth, gender, blood group, father/mother name, spouse name, location.
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS blood_group text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS father_mother_name text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS spouse_name text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS location text;

NOTIFY pgrst, 'reload schema';
