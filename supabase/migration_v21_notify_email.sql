-- Migration v21 (19 Sep 2026): per-employee switch "email this person about their attendance and leave".
-- Run once in the Supabase SQL editor. Additive only.
--
-- ON for everyone by default (the email addresses on record are the ones the office supplied).
-- An admin can turn it off for a person in Edit Employee -> "Email updates".

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;
