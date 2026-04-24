-- migration_v4.sql: Hard-Delete & Cascade Enforcement

-- 1. CLEANUP ORPHANS (Pre-emptive)
DELETE FROM public.face_encodings WHERE employee_id NOT IN (SELECT employee_id FROM public.employees);
DELETE FROM public.fingerprints WHERE employee_id NOT IN (SELECT employee_id FROM public.employees);
DELETE FROM public.rfid_tags WHERE employee_id NOT IN (SELECT employee_id FROM public.employees);

-- 2. RE-APPLY CONSTRAINTS WITH CASCADE
-- Face Encodings
ALTER TABLE public.face_encodings DROP CONSTRAINT IF EXISTS face_encodings_employee_id_fkey;
ALTER TABLE public.face_encodings 
ADD CONSTRAINT face_encodings_employee_id_fkey 
FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;

-- Fingerprints
ALTER TABLE public.fingerprints DROP CONSTRAINT IF EXISTS fingerprints_employee_id_fkey;
ALTER TABLE public.fingerprints 
ADD CONSTRAINT fingerprints_employee_id_fkey 
FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;

-- RFID Tags
ALTER TABLE public.rfid_tags DROP CONSTRAINT IF EXISTS rfid_tags_employee_id_fkey;
ALTER TABLE public.rfid_tags 
ADD CONSTRAINT rfid_tags_employee_id_fkey 
FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE CASCADE;

-- 3. SECURITY ALERTS (SET NULL to preserve audit trail)
ALTER TABLE public.security_alerts DROP CONSTRAINT IF EXISTS security_alerts_employee_id_fkey;
-- Note: security_alerts.employee_id is text, employees.employee_id is text.
ALTER TABLE public.security_alerts 
ADD CONSTRAINT security_alerts_employee_id_fkey 
FOREIGN KEY (employee_id) REFERENCES public.employees(employee_id) ON DELETE SET NULL;

-- 4. CLEANUP OLD LOGIC
DROP TRIGGER IF EXISTS tr_purge_biometrics ON public.employees;
DROP FUNCTION IF EXISTS purge_biometrics_on_delete();

-- 5. REMOVE STATUS CONSTRAINT (Optional, but makes schema cleaner for hard-delete)
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_status_check;
-- We'll keep the column but hard-delete will be the primary removal method.
