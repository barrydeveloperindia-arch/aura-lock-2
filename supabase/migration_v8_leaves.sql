-- Migration v8 (8 Sep 2026): leave register + company holidays.
-- Run once in the Supabase SQL editor. Additive only: creates two tables,
-- touches nothing that exists.
--
--   leaves    one row per employee per day: CL / SL / EL / WFH / OD
--   holidays  one row per company holiday date (everyone)
--
-- The monthly report then counts: absent = working days - present - leave,
-- where working days = weekdays minus holidays.

CREATE TABLE IF NOT EXISTS public.leaves (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
    date        date NOT NULL,
    type        text NOT NULL CHECK (type IN ('CL', 'SL', 'EL', 'WFH', 'OD')),
    note        text,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS leaves_date_idx ON public.leaves (date);

CREATE TABLE IF NOT EXISTS public.holidays (
    date  date PRIMARY KEY,
    name  text NOT NULL
);

-- Optional: 2026 public holidays you observe. Edit or delete lines before running.
-- INSERT INTO public.holidays (date, name) VALUES
--   ('2026-10-02', 'Gandhi Jayanti'),
--   ('2026-11-08', 'Diwali')
-- ON CONFLICT (date) DO NOTHING;
