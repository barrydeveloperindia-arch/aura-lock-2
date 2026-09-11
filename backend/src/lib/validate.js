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

/** Company employee-ID format: EL101 … EL999 (HR format, upper-case, three digits).
 *  EMP-### is the interim format still carried by staff not yet renamed. */
const EMPLOYEE_ID_RE = /^(EL\d{3}|EMP-\d{3})$/;
function isValidEmployeeId(value) {
    return typeof value === 'string' && EMPLOYEE_ID_RE.test(value.trim());
}

module.exports = { isValidEmail, normalizeEmail, EMAIL_RE, isValidEmployeeId, EMPLOYEE_ID_RE };
