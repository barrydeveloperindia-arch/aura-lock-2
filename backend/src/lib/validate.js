/**
 * Small input validators shared by the employee routes.
 * Live data on 7 Sep 2026 had 13 staff with mistyped domains ("gnail.com",
 * "gmail", "gm"); the form and the API now refuse anything that is not
 * local@domain.tld.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

/** Trimmed, lower-cased email, or '' for empty input. */
function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** true for name@domain.tld (any TLD of 2+ letters), false otherwise. */
function isValidEmail(value) {
    const v = normalizeEmail(value);
    return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
}

/** Company employee-ID format: EMP-001 … EMP-999 (upper-case, three digits). */
const EMPLOYEE_ID_RE = /^EMP-\d{3}$/;
function isValidEmployeeId(value) {
    return typeof value === 'string' && EMPLOYEE_ID_RE.test(value.trim());
}

module.exports = { isValidEmail, normalizeEmail, EMAIL_RE, isValidEmployeeId, EMPLOYEE_ID_RE };
