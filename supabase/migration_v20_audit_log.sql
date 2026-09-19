-- Migration v20 (19 Sep 2026): audit trail — who changed what, and when.
-- Run once in the Supabase SQL editor. Additive only: creates one table, touches nothing that exists.
--
-- One row per admin action on staff records or leaves. Sensitive identifiers (Aadhaar, PAN,
-- bank account) are stored masked (last 4 characters only), never in full.

CREATE TABLE IF NOT EXISTS public.audit_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    actor         text NOT NULL,
    action        text NOT NULL,          -- employee.create | employee.update | employee.delete | employee.photo | leave.add | leave.status | leave.delete ...
    entity_type   text NOT NULL,          -- employee | leave
    entity_id     text,
    entity_label  text,                   -- human-readable, e.g. "Anurag Sahni (EL018)"
    changes       jsonb
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON public.audit_log (entity_type, entity_id);
