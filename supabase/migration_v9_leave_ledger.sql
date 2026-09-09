-- Migration v9 (9 Sep 2026): monthly CL ledger, matching the payroll workbook
-- (PREV CL / ADD CL / CL USED / PENDING CL per employee per month).
-- Run once in the Supabase SQL editor. Additive only.
--
-- Also reloads PostgREST's schema cache so tables created earlier (leaves,
-- holidays) become visible to the API.

CREATE TABLE IF NOT EXISTS public.leave_ledger (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
    month       date NOT NULL,                 -- first day of the month
    opening_cl  numeric(5,1) NOT NULL DEFAULT 0,
    added_cl    numeric(5,1) NOT NULL DEFAULT 1, -- 1 CL accrues every month
    used_cl     numeric(5,1) NOT NULL DEFAULT 0,
    closing_cl  numeric(5,1) NOT NULL DEFAULT 0,
    source      text NOT NULL DEFAULT 'sheet',   -- sheet | sheet-opening | system
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (employee_id, month)
);

NOTIFY pgrst, 'reload schema';

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('leaves', 'holidays', 'leave_ledger')
ORDER BY table_name;
