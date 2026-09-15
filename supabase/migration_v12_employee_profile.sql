-- Migration v12 (15 Sep 2026): designation and joining date on staff profiles, sourced from
-- the accounts team's Tally "Employees Profile" register.
-- Run once in the Supabase SQL editor. Additive only.
--
-- Deliberately NOT added here: PAN, Aadhaar, bank account/IFSC, date of birth, blood group,
-- father/mother/spouse name. This is a face-recognition attendance system, not an HR/payroll
-- master file -- it has no functional need for government ID or bank details, and no special
-- access controls (masking, audit log, encryption-at-field-level) for that class of data.
-- Those fields live in the accounts team's own Tally register and the staff-master workbook
-- Claude saved to Google Drive, not here.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS joining_date date;

NOTIFY pgrst, 'reload schema';
