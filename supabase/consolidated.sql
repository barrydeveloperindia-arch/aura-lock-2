-- Enable pgvector extension to work with face embeddings
create extension if not exists vector;

-- Employees Table
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique not null,
  name text not null,
  email text,
  role text not null check (role in ('admin', 'employee')),
  face_embedding vector(128),
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Access Logs Table
create table public.access_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id text references public.employees(employee_id),
  status text not null check (status in ('success', 'failed')),
  confidence float,
  device_id text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Row Level Security
alter table public.employees enable row level security;
alter table public.access_logs enable row level security;

-- Policies
create policy "Allow read access to employees" on public.employees for select using (true);
create policy "Allow all access to employees via service role" on public.employees using (true);

create policy "Allow insert access to logs" on public.access_logs for insert with check (true);
create policy "Allow read access to logs" on public.access_logs for select using (true);
-- migration_v2.sql: Production-Ready Database Schema for Smart Door Lock

-- 1. EXTENSIONS
create extension if not exists vector;

-- 2. DEDUPLICATION STRATEGY (SAFE CLEANUP)
-- Identifies duplicate employee_id and keeps the one with the most recent created_at
with duplicates as (
    select id, employee_id,
           row_number() over (partition by employee_id order by created_at desc) as rn
    from public.employees
)
delete from public.employees
where id in (select id from duplicates where rn > 1);

-- 3. SCHEMA EVOLUTION (EMPLOYEES)
alter table public.employees 
add column if not exists status text default 'Active' check (status in ('Active', 'Disabled', 'Deleted')),
add column if not exists updated_at timestamp with time zone default timezone('utc'::text, now());

-- Add strict unique constraint on name to prevent display confusion
alter table public.employees add constraint unique_employee_name unique (name);

-- 4. NORMALIZED BIOMETRICS TABLES
-- Face Encodings
create table if not exists public.face_encodings (
    id uuid primary key default gen_random_uuid(),
    employee_id text not null references public.employees(employee_id) on delete cascade,
    embedding vector(128) not null,
    metadata jsonb default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(employee_id) -- Move to 1:1 for now as per requirement, remove unique for 1:N
);

-- Fingerprints
create table if not exists public.fingerprints (
    id uuid primary key default gen_random_uuid(),
    employee_id text not null references public.employees(employee_id) on delete cascade,
    finger_index int check (finger_index >= 0 and finger_index <= 9),
    template_data text not null, -- Sensor specific format
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RFID Tags
create table if not exists public.rfid_tags (
    tag_id text primary key,
    employee_id text not null references public.employees(employee_id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. DATA MIGRATION (Move face embeddings to dedicated table)
insert into public.face_encodings (employee_id, embedding)
select employee_id, face_embedding from public.employees
where face_embedding is not null
on conflict (employee_id) do nothing;

-- Clean up old column from employees (Optional, but cleaner)
-- alter table public.employees drop column face_embedding;

-- 6. AUTOMATION (Updated At)
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_employees_updated_at
    before update on public.employees
    for each row
    execute function update_updated_at_column();

-- 7. SOFT-DELETE & PURGE LOGIC
create or replace function purge_biometrics_on_delete()
returns trigger as $$
begin
    if new.status = 'Deleted' then
        -- Clear face embeddings
        update public.face_encodings set embedding = null where employee_id = new.employee_id;
        -- Clear other biometrics
        delete from public.fingerprints where employee_id = new.employee_id;
        delete from public.rfid_tags where employee_id = new.employee_id;
        -- Clear old column if it still exists
        new.face_embedding = null;
        new.image_url = null;
    end if;
    return new;
end;
$$ language plpgsql;

create trigger tr_purge_biometrics
    before update on public.employees
    for each row
    when (new.status = 'Deleted' and old.status <> 'Deleted')
    execute function purge_biometrics_on_delete();

-- 8. PERFORMANCE INDEXES
-- Index creation moved to the end of file where column is_deleted is added
create index if not exists idx_face_embedding_cosine on public.face_encodings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_logs_created_at on public.access_logs (created_at desc);

-- 8. SECURITY (RLS Policies for new tables)
alter table public.face_encodings enable row level security;
alter table public.fingerprints enable row level security;
alter table public.rfid_tags enable row level security;

create policy "Allow internal access to biometrics" on public.face_encodings using (true);
create policy "Allow internal access to fingerprints" on public.fingerprints using (true);
create policy "Allow internal access to rfid" on public.rfid_tags using (true);
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
