-- Migration v13 (15 Sep 2026): finish standardizing employee_id codes to the "EL###" format.
--
-- 9 of the 18 legacy-format employees (EMP-xxx / Eng_xxx / ENG_xxxx) could not be renamed via
-- the app's API because fingerprints, face_encodings, and security_alerts reference
-- employees.employee_id directly (the display code), not the internal uuid -- so a rename
-- orphaned their biometric rows and the foreign key rejected it.
--
-- Step 1 makes those 3 foreign keys DEFERRABLE. This does NOT change their existing ON DELETE
-- behavior -- it only lets Postgres check them at COMMIT instead of after each statement, so a
-- rename can update the parent row and its children together in one transaction.
-- Step 2 does the actual rename for the 9 employees, in one transaction so the deferred checks
-- pass. (Child UPDATEs are harmless no-ops for the tables a given employee has no rows in.)
--
-- Run once in the Supabase SQL editor.

ALTER TABLE public.fingerprints ALTER CONSTRAINT fingerprints_employee_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.face_encodings ALTER CONSTRAINT face_encodings_employee_id_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE public.security_alerts ALTER CONSTRAINT security_alerts_employee_id_fkey DEFERRABLE INITIALLY DEFERRED;

BEGIN;

-- EMP-001 -> EL001 (Shiv Kumar)
UPDATE public.fingerprints SET employee_id = 'EL001' WHERE employee_id = 'EMP-001';
UPDATE public.face_encodings SET employee_id = 'EL001' WHERE employee_id = 'EMP-001';
UPDATE public.security_alerts SET employee_id = 'EL001' WHERE employee_id = 'EMP-001';
UPDATE public.employees SET employee_id = 'EL001', updated_at = now() WHERE employee_id = 'EMP-001';

-- EMP-010 -> EL005 (Devanshu Madke)
UPDATE public.fingerprints SET employee_id = 'EL005' WHERE employee_id = 'EMP-010';
UPDATE public.face_encodings SET employee_id = 'EL005' WHERE employee_id = 'EMP-010';
UPDATE public.security_alerts SET employee_id = 'EL005' WHERE employee_id = 'EMP-010';
UPDATE public.employees SET employee_id = 'EL005', updated_at = now() WHERE employee_id = 'EMP-010';

-- Emp-022 -> EL008 (Nisha)
UPDATE public.fingerprints SET employee_id = 'EL008' WHERE employee_id = 'Emp-022';
UPDATE public.face_encodings SET employee_id = 'EL008' WHERE employee_id = 'Emp-022';
UPDATE public.security_alerts SET employee_id = 'EL008' WHERE employee_id = 'Emp-022';
UPDATE public.employees SET employee_id = 'EL008', updated_at = now() WHERE employee_id = 'Emp-022';

-- EMP-024 -> EL010 (Neeraj)
UPDATE public.fingerprints SET employee_id = 'EL010' WHERE employee_id = 'EMP-024';
UPDATE public.face_encodings SET employee_id = 'EL010' WHERE employee_id = 'EMP-024';
UPDATE public.security_alerts SET employee_id = 'EL010' WHERE employee_id = 'EMP-024';
UPDATE public.employees SET employee_id = 'EL010', updated_at = now() WHERE employee_id = 'EMP-024';

-- Emp-027 -> EL013 (Sethi ji)
UPDATE public.fingerprints SET employee_id = 'EL013' WHERE employee_id = 'Emp-027';
UPDATE public.face_encodings SET employee_id = 'EL013' WHERE employee_id = 'Emp-027';
UPDATE public.security_alerts SET employee_id = 'EL013' WHERE employee_id = 'Emp-027';
UPDATE public.employees SET employee_id = 'EL013', updated_at = now() WHERE employee_id = 'Emp-027';

-- Emp-028 -> EL014 (Himanshu)
UPDATE public.fingerprints SET employee_id = 'EL014' WHERE employee_id = 'Emp-028';
UPDATE public.face_encodings SET employee_id = 'EL014' WHERE employee_id = 'Emp-028';
UPDATE public.security_alerts SET employee_id = 'EL014' WHERE employee_id = 'Emp-028';
UPDATE public.employees SET employee_id = 'EL014', updated_at = now() WHERE employee_id = 'Emp-028';

-- EMP-19 -> EL015 (Karan)
UPDATE public.fingerprints SET employee_id = 'EL015' WHERE employee_id = 'EMP-19';
UPDATE public.face_encodings SET employee_id = 'EL015' WHERE employee_id = 'EMP-19';
UPDATE public.security_alerts SET employee_id = 'EL015' WHERE employee_id = 'EMP-19';
UPDATE public.employees SET employee_id = 'EL015', updated_at = now() WHERE employee_id = 'EMP-19';

-- ENG_0006 -> EL019 (Roof house keeping)
UPDATE public.fingerprints SET employee_id = 'EL019' WHERE employee_id = 'ENG_0006';
UPDATE public.face_encodings SET employee_id = 'EL019' WHERE employee_id = 'ENG_0006';
UPDATE public.security_alerts SET employee_id = 'EL019' WHERE employee_id = 'ENG_0006';
UPDATE public.employees SET employee_id = 'EL019', updated_at = now() WHERE employee_id = 'ENG_0006';

-- Eng-666 -> EL037 (Lariss mam)
UPDATE public.fingerprints SET employee_id = 'EL037' WHERE employee_id = 'Eng-666';
UPDATE public.face_encodings SET employee_id = 'EL037' WHERE employee_id = 'Eng-666';
UPDATE public.security_alerts SET employee_id = 'EL037' WHERE employee_id = 'Eng-666';
UPDATE public.employees SET employee_id = 'EL037', updated_at = now() WHERE employee_id = 'Eng-666';

COMMIT;

NOTIFY pgrst, 'reload schema';
