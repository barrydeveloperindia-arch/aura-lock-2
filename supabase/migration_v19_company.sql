-- Migration v19 (16 Sep 2026): split "which company" out of department into its own column.
-- department had been reused as a company marker for staff belonging to a different Disha
-- Arcade tenant (Sky5 Hotel, A & A Architect, Bright Kids School), which overwrote their real
-- internal department. This adds `company` so both survive as separate, correct columns.
-- Run once in the Supabase SQL editor. Additive only.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS company text;

NOTIFY pgrst, 'reload schema';
