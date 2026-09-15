-- Migration v17 (15 Sep 2026): bank and contact fields from the Tally register's
-- "Bank Details" and "Contact Details" panels. Run once in the Supabase SQL editor.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS contact_number text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_branch text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS bank_ifsc text;

NOTIFY pgrst, 'reload schema';
