-- Migration v21 (19 Sep 2026): per-employee switch "email this person about their attendance and leave".
-- Run once in the Supabase SQL editor. Additive only.
--
-- OFF for everyone by default, then ON only for the 9 people whose email address is confirmed
-- by the Tally Employees Profile (Contact Details). Most other stored addresses are placeholders
-- (e.g. dad@gmail.com), so nobody else is emailed until a real address is entered and the
-- "Email updates" box is ticked in Edit Employee.

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT false;

UPDATE public.employees
   SET notify_email = true
 WHERE employee_id IN ('EL018', 'EL012', 'EL107', 'EL200', 'EL021', 'EL101', 'EL024', 'EL066', 'EL065');
