-- migration_v3.sql: Identity Integrity & UNIQUE Constraints

-- 1. ENFORCE UNIQUE CONSTRAINTS
-- Ensure RFID tags are globally unique
ALTER TABLE public.rfid_tags ADD CONSTRAINT unique_tag_id UNIQUE (tag_id);

-- Ensure Fingerprint templates are globally unique (prevent sharing/duplicates)
ALTER TABLE public.fingerprints ADD CONSTRAINT unique_template_data UNIQUE (template_data);

-- 2. SECURITY ALERTS TABLE
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type text NOT NULL CHECK (alert_type IN ('duplicate_id_attempt', 'biometric_conflict', 'suspicious_rfid_reassignment', 'unauthorized_admin_access')),
    employee_id text,
    severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    details jsonb DEFAULT '{}'::jsonb,
    device_id text DEFAULT 'server',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. ENABLE RLS
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "Allow internal logging to security_alerts" ON public.security_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow admins to read security_alerts" ON public.security_alerts FOR SELECT USING (true);

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON public.security_alerts (alert_type);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON public.security_alerts (created_at DESC);
