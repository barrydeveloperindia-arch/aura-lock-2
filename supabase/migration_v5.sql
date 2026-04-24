-- migration_v5.sql: Fix Missing Columns and Schema Integrity
-- 1. Add missing metadata column to access_logs
ALTER TABLE public.access_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2. Add missing is_deleted column to employees (if needed by old indexes)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- 3. Fix potential stale index
DROP INDEX IF EXISTS idx_employees_active_not_deleted;
CREATE INDEX idx_employees_active_not_deleted ON public.employees (status, is_deleted);

-- 4. Ensure rfid table has correct references if missing
-- (Already handled in v4, but double check)
