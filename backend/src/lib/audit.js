/**
 * Audit trail: who changed what. Writing is best-effort — a missing table or a DB hiccup must
 * never fail the admin action that triggered it. Sensitive identifiers are stored masked.
 */
const supabase = require('./adminDb');

const SENSITIVE = new Set(['pan_number', 'aadhaar_number', 'bank_account_number']);
const IGNORED = new Set(['face_embedding', 'updated_at', 'fingerprint_registered', 'face_registered']);

function maskValue(v) {
    if (v === null || v === undefined || v === '') return null;
    const chars = [...String(v)];
    let seen = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
        if (/[A-Za-z0-9]/.test(chars[i])) { if (seen >= 4) chars[i] = '•'; seen++; }
    }
    return chars.join('');
}

function diffFields(before, updates) {
    const changes = {};
    for (const [key, next] of Object.entries(updates || {})) {
        if (IGNORED.has(key)) continue;
        const prev = before ? before[key] : undefined;
        if (String(prev ?? '') === String(next ?? '')) continue;
        changes[key] = SENSITIVE.has(key)
            ? { from: maskValue(prev), to: maskValue(next) }
            : { from: prev ?? null, to: next ?? null };
    }
    return changes;
}

function actorOf(req) {
    const u = req && req.user;
    return (u && (u.email || u.name)) || 'unknown';
}

let warnedMissing = false;
async function logAudit(req, { action, entityType, entityId, entityLabel, changes }) {
    try {
        const { error } = await supabase.from('audit_log').insert({
            actor: actorOf(req), action, entity_type: entityType,
            entity_id: entityId ? String(entityId) : null,
            entity_label: entityLabel || null,
            changes: changes && Object.keys(changes).length ? changes : null,
        });
        if (error) {
            if (/Could not find the table|does not exist|schema cache/i.test(error.message || '')) {
                if (!warnedMissing) { warnedMissing = true; console.warn('[Audit] audit_log table missing — run supabase/migration_v20_audit_log.sql'); }
            } else console.warn('[Audit] write failed:', error.message);
        }
    } catch (e) { console.warn('[Audit] write failed:', e.message); }
}

module.exports = { maskValue, diffFields, logAudit, actorOf };
