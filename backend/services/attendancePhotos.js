/**
 * Attendance Photo Service
 * ------------------------
 * Stores the camera frame captured at check-in / check-out in a PRIVATE
 * Supabase Storage bucket and hands out short-lived signed URLs to the
 * admin dashboard.
 *
 * Design decisions (see docs/ATTENDANCE_PHOTOS.md):
 *  - No schema change. Photos are addressed by a deterministic path derived
 *    from the attendance row:   <YYYY-MM-DD>/<attendance_id>_<in|out>.jpg
 *    so the DB never needs a new column and the feature works on any
 *    backend that runs this code.
 *  - Timestamp is NOT burned into the pixels. The authoritative time is the
 *    server-side check_in / check_out already on the attendance row; the
 *    admin UI overlays it. The verification frame stays untouched.
 *  - Rolling check-out overwrites the "out" photo, mirroring how
 *    recordAttendance() overwrites check_out.
 *  - Photo failures never block attendance. Every public function here
 *    swallows errors and logs them.
 *  - Retention: folders older than ATTENDANCE_PHOTO_RETENTION_DAYS (default
 *    90) are purged by cleanupExpiredPhotos().
 *
 * Requires SUPABASE_SERVICE_KEY (service-role / sb_secret_ key). The anon /
 * publishable key cannot write to a private bucket. Falls back to
 * SUPABASE_KEY so the module still loads, but uploads will be rejected by
 * RLS until the service key is configured.
 */

const { createClient } = require('@supabase/supabase-js');
const Jimp = require('jimp');

const BUCKET = process.env.ATTENDANCE_PHOTO_BUCKET || 'attendance-photos';
const STAMP_TZ = process.env.ATTENDANCE_PHOTO_TZ || 'Asia/Kolkata';
const RETENTION_DAYS = parseInt(process.env.ATTENDANCE_PHOTO_RETENTION_DAYS, 10) || 90;
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB, matches bucket limit

const KINDS = new Set(['in', 'out']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

let _client = null;
let _warnedNoServiceKey = false;

function getClient() {
    if (_client) return _client;
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;
    const key = serviceKey || process.env.SUPABASE_KEY;
    if (!serviceKey && !_warnedNoServiceKey) {
        _warnedNoServiceKey = true;
        console.warn('[Photos] SUPABASE_SERVICE_KEY not set. Photo uploads will be rejected by storage RLS until it is configured.');
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
}

/** Allows tests to inject a fake client. */
function _setClientForTests(client) {
    _client = client;
}

function photoPath(date, attendanceId, kind) {
    return `${date}/${attendanceId}_${kind}.jpg`;
}

function isValidDate(date) {
    return DATE_RE.test(date || '');
}

function isValidKind(kind) {
    return KINDS.has(kind);
}

function isValidAttendanceId(id) {
    return UUID_RE.test(id || '');
}

/** "06 Sep 2026, 11:34:33 IST" in the office timezone. */
function formatStampTime(capturedAt) {
    const d = capturedAt ? new Date(capturedAt) : new Date();
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: STAMP_TZ, day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const tz = STAMP_TZ === 'Asia/Kolkata' ? 'IST' : STAMP_TZ;
    return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${tz}`;
}

/**
 * Normalise a terminal GPS fix. Returns null unless lat/lng are real numbers.
 * @param {{lat?, lng?, accuracy?, fix_time?}} raw
 */
function normalizeLocation(raw) {
    if (!raw) return null;
    const lat = Number(raw.lat), lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const accuracy = Number(raw.accuracy);
    return {
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        accuracy_m: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        fix_time: raw.fix_time || null,
    };
}

/** "LOC 28.61390, 77.20900  +/-15 m" or '' when there is no fix. */
function formatStampLocation(location) {
    const loc = normalizeLocation(location);
    if (!loc) return '';
    const acc = loc.accuracy_m != null ? `  +/-${loc.accuracy_m} m` : '';
    return `LOC ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}${acc}`;
}

function sidecarPath(date, attendanceId, kind) {
    return `${date}/${attendanceId}_${kind}.json`;
}

/** Read the location sidecar for a photo, or null. */
async function getPhotoLocation({ date, attendanceId, kind }) {
    try {
        if (!isValidAttendanceId(attendanceId) || !isValidDate(date) || !isValidKind(kind)) return null;
        const { data, error } = await getClient().storage.from(BUCKET).download(sidecarPath(date, attendanceId, kind));
        if (error || !data) return null;
        const text = typeof data.text === 'function' ? await data.text() : Buffer.from(await data.arrayBuffer()).toString('utf8');
        const parsed = JSON.parse(text);
        return normalizeLocation(parsed.location) ? parsed : null;
    } catch (_err) {
        return null;
    }
}

// ── Employee avatars ──────────────────────────────────────────────────────────
// A 256x256 face crop from the UNSTAMPED frame of the latest scan, stored as
// avatars/<employee_id>.jpg and refreshed on every check-in / check-out. The
// dashboard fetches signed URLs for a whole list in one call.
const AVATAR_SIZE = 256;
const AVATAR_TTL_SECONDS = 60 * 60;
const EMP_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

function avatarPath(employeeId) {
    return `avatars/${employeeId}.jpg`;
}

/**
 * Crop the upper-centre square of a frame (where a face sits on a portrait or
 * landscape terminal frame) and shrink it to AVATAR_SIZE. Returns a JPEG buffer.
 */
async function makeAvatar(buffer) {
    const img = await Jimp.read(buffer);
    const w = img.bitmap.width, h = img.bitmap.height;
    const side = Math.min(w, h);
    const x = Math.round((w - side) / 2);
    // Bias the crop upward on portrait frames: faces sit in the top 2/3.
    const y = h > w ? Math.round((h - side) * 0.25) : 0;
    return img.crop(x, y, side, side).resize(AVATAR_SIZE, AVATAR_SIZE).quality(82).getBufferAsync(Jimp.MIME_JPEG);
}

/**
 * Store / refresh the avatar for an employee from a raw camera frame.
 * Never throws; returns the storage path or null.
 */
async function saveEmployeeAvatar(employeeId, frameBuffer) {
    try {
        if (!EMP_ID_RE.test(employeeId || '') || !frameBuffer || !frameBuffer.length) return null;
        const avatar = await makeAvatar(frameBuffer);
        const path = avatarPath(employeeId);
        const { error } = await getClient().storage.from(BUCKET).upload(path, avatar, {
            contentType: 'image/jpeg', upsert: true, cacheControl: '0',
        });
        if (error) { console.error(`[Photos] Avatar upload failed for ${employeeId}: ${error.message}`); return null; }
        return path;
    } catch (err) {
        console.error('[Photos] Avatar error:', err.message);
        return null;
    }
}

/**
 * Signed URLs for many employees at once.
 * @param {string[]} employeeIds
 * @returns {Promise<Record<string, string>>} employee_id -> url (only those that exist)
 */
async function getAvatarUrls(employeeIds) {
    const ids = [...new Set((employeeIds || []).filter(id => EMP_ID_RE.test(id || '')))];
    if (ids.length === 0) return {};
    try {
        const storage = getClient().storage.from(BUCKET);
        // Only sign what exists: one list call, then one batch sign call.
        const { data: files, error: listErr } = await storage.list('avatars', { limit: 1000 });
        if (listErr || !files) return {};
        const existing = new Set(files.map(f => f.name));
        const paths = ids.filter(id => existing.has(`${id}.jpg`)).map(avatarPath);
        if (paths.length === 0) return {};
        const { data, error } = await storage.createSignedUrls(paths, AVATAR_TTL_SECONDS);
        if (error || !data) return {};
        const out = {};
        for (const entry of data) {
            if (!entry.signedUrl) continue;
            const id = (entry.path || '').replace(/^avatars\//, '').replace(/\.jpg$/, '');
            if (id) out[id] = entry.signedUrl;
        }
        return out;
    } catch (err) {
        console.error('[Photos] Avatar URL error:', err.message);
        return {};
    }
}

let _fontCache = null;
async function loadStampFonts() {
    if (!_fontCache) {
        _fontCache = Promise.all([
            Jimp.loadFont(Jimp.FONT_SANS_32_WHITE),
            Jimp.loadFont(Jimp.FONT_SANS_16_WHITE),
        ]).then(([big, small]) => ({ big, small }));
    }
    return _fontCache;
}

/**
 * Burn a caption band into the bottom of a JPEG:
 *   line 1: <name>  (<employeeId>)
 *   line 2: CHECK IN | CHECK OUT   <dd Mon yyyy, HH:mm:ss IST>
 * Returns a new JPEG buffer, or the original buffer if anything fails.
 */
async function stampPhoto(buffer, { name, employeeId, kind, capturedAt, location } = {}) {
    try {
        const [img, fonts] = await Promise.all([Jimp.read(buffer), loadStampFonts()]);
        const w = img.bitmap.width;
        const h = img.bitmap.height;

        const who = [name, employeeId ? `(${employeeId})` : ''].filter(Boolean).join('  ').trim() || 'Unknown';
        const label = kind === 'out' ? 'CHECK OUT' : 'CHECK IN';
        const when = formatStampTime(capturedAt);              // "06 Sep 2026, 11:34:33 IST"
        const [datePart, timePart] = when.split(', ');
        // Optional GPS line from the terminal: "LOC 28.61390, 77.20900  +/-15 m"
        const locLine = formatStampLocation(location);
        const withLoc = (lines) => (locLine ? [...lines, locLine] : lines);

        // Pick the biggest font whose lines all fit; split date/time onto a
        // third line for narrow (portrait) frames. Never wrap mid-line.
        const candidates = [
            { font: fonts.big, lineH: 36, pad: 14, lines: withLoc([who, `${label}   ${when}`]) },
            { font: fonts.big, lineH: 36, pad: 14, lines: withLoc([who, `${label}   ${datePart}`, timePart]) },
            { font: fonts.small, lineH: 20, pad: 8, lines: withLoc([who, `${label}   ${when}`]) },
            { font: fonts.small, lineH: 20, pad: 8, lines: withLoc([who, `${label}   ${datePart}`, timePart]) },
        ];
        const fits = (c) => c.lines.every(t => Jimp.measureText(c.font, t) <= w - c.pad * 2);
        const layout = candidates.find(fits) || candidates[candidates.length - 1];
        const { font, lineH, pad, lines } = layout;
        const bandH = lineH * lines.length + pad * 2;

        // Semi-transparent black band
        const band = new Jimp(w, bandH, 0x000000B3);
        img.composite(band, 0, h - bandH);
        lines.forEach((text, i) => img.print(font, pad, h - bandH + pad + lineH * i, text));

        return await img.quality(85).getBufferAsync(Jimp.MIME_JPEG);
    } catch (err) {
        console.error('[Photos] Stamp failed, storing unstamped frame:', err.message);
        return buffer;
    }
}

/**
 * Upload (upsert) a JPEG frame for an attendance event.
 * @returns {Promise<string|null>} storage path on success, null on failure.
 *
 * `stamp` (optional): { name, employeeId, capturedAt } burns a CCTV-style
 * caption into the bottom of the frame: name + id on one line, IN/OUT + date +
 * time (server clock, IST) on the next. If stamping fails the original frame
 * is stored instead, so a bad font/decoder never loses the evidence.
 */
async function saveAttendancePhoto({ buffer, attendanceId, date, kind, stamp }) {
    try {
        if (!buffer || !buffer.length) return null;
        if (buffer.length > MAX_PHOTO_BYTES) {
            console.warn(`[Photos] Frame too large (${buffer.length} bytes), skipping.`);
            return null;
        }
        if (!isValidAttendanceId(attendanceId) || !isValidDate(date) || !isValidKind(kind)) {
            console.warn(`[Photos] Invalid photo target id=${attendanceId} date=${date} kind=${kind}`);
            return null;
        }

        if (stamp) {
            buffer = await stampPhoto(buffer, { ...stamp, kind });
        }

        const path = photoPath(date, attendanceId, kind);
        const { error } = await getClient().storage.from(BUCKET).upload(path, buffer, {
            contentType: 'image/jpeg',
            upsert: true,
            cacheControl: '0',
        });
        if (error) {
            console.error(`[Photos] Upload failed for ${path}: ${error.message}`);
            return null;
        }
        console.log(`[Photos] Saved ${path} (${buffer.length} bytes)`);

        // Location sidecar: <date>/<id>_<kind>.json next to the photo (no schema change)
        const loc = normalizeLocation(stamp?.location);
        if (loc) {
            const sidecar = Buffer.from(JSON.stringify({
                attendance_id: attendanceId, kind, captured_at: stamp?.capturedAt || null,
                location: loc, source: stamp?.locationSource || 'terminal',
            }));
            const { error: scErr } = await getClient().storage.from(BUCKET).upload(sidecarPath(date, attendanceId, kind), sidecar, {
                contentType: 'application/json', upsert: true, cacheControl: '0',
            });
            if (scErr) console.error(`[Photos] Location sidecar failed for ${path}: ${scErr.message}`);
        }
        return path;
    } catch (err) {
        console.error('[Photos] Unexpected upload error:', err.message);
        return null;
    }
}

/**
 * For a set of dates, return which attendance rows have in/out photos.
 * @param {string[]} dates  YYYY-MM-DD strings
 * @returns {Promise<Map<string, {in: boolean, out: boolean}>>} keyed by attendance id
 */
async function listPhotoAvailability(dates) {
    const result = new Map();
    const unique = [...new Set((dates || []).filter(isValidDate))];
    if (unique.length === 0) return result;

    await Promise.all(unique.map(async (date) => {
        try {
            const { data, error } = await getClient().storage.from(BUCKET).list(date, { limit: 1000 });
            if (error || !data) return;
            for (const obj of data) {
                const m = /^([0-9a-fA-F-]{36})_(in|out)\.jpg$/.exec(obj.name);
                if (!m) continue;
                const entry = result.get(m[1]) || { in: false, out: false };
                entry[m[2]] = true;
                result.set(m[1], entry);
            }
        } catch (err) {
            console.error(`[Photos] List failed for ${date}: ${err.message}`);
        }
    }));
    return result;
}

/**
 * Signed URLs for every photo on a page of attendance rows, in one batch call.
 * @param {{id:string, date:string}[]} rows
 * @param {Map<string,{in:boolean,out:boolean}>} availability  from listPhotoAvailability
 * @returns {Promise<Map<string,{in:string|null,out:string|null}>>} keyed by attendance id
 */
async function getSignedPhotoUrlsForRows(rows, availability) {
    const result = new Map();
    const paths = [];
    for (const r of rows || []) {
        const a = availability.get(r.id);
        if (!a || !isValidDate(r.date) || !isValidAttendanceId(r.id)) continue;
        if (a.in) paths.push(photoPath(r.date, r.id, 'in'));
        if (a.out) paths.push(photoPath(r.date, r.id, 'out'));
    }
    if (paths.length === 0) return result;
    try {
        const { data, error } = await getClient().storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        if (error || !data) return result;
        for (const entry of data) {
            const m = /^(\d{4}-\d{2}-\d{2})\/([0-9a-fA-F-]{36})_(in|out)\.jpg$/.exec(entry.path || '');
            if (!m || !entry.signedUrl) continue;
            const cur = result.get(m[2]) || { in: null, out: null };
            cur[m[3]] = entry.signedUrl;
            result.set(m[2], cur);
        }
    } catch (err) {
        console.error('[Photos] Batch sign error:', err.message);
    }
    return result;
}

/**
 * Produce a short-lived signed URL for one photo.
 * @returns {Promise<{url: string, expires_at: string}|null>}
 */
async function getSignedPhotoUrl({ date, attendanceId, kind }) {
    try {
        if (!isValidAttendanceId(attendanceId) || !isValidDate(date) || !isValidKind(kind)) return null;
        const path = photoPath(date, attendanceId, kind);
        const { data, error } = await getClient().storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
        if (error || !data?.signedUrl) return null;
        return {
            url: data.signedUrl,
            expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
        };
    } catch (err) {
        console.error('[Photos] Signed URL error:', err.message);
        return null;
    }
}

/**
 * Delete every date folder older than the retention window.
 * @returns {Promise<{deletedFolders: string[], deletedFiles: number}>}
 */
async function cleanupExpiredPhotos(retentionDays = RETENTION_DAYS) {
    const summary = { deletedFolders: [], deletedFiles: 0 };
    try {
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        const storage = getClient().storage.from(BUCKET);
        const { data: folders, error } = await storage.list('', { limit: 1000 });
        if (error || !folders) {
            if (error) console.error('[Photos] Cleanup list error:', error.message);
            return summary;
        }

        for (const folder of folders) {
            if (!isValidDate(folder.name) || folder.name >= cutoffStr) continue;
            const { data: files, error: listErr } = await storage.list(folder.name, { limit: 1000 });
            if (listErr || !files || files.length === 0) continue;
            const paths = files.map(f => `${folder.name}/${f.name}`);
            const { error: rmErr } = await storage.remove(paths);
            if (rmErr) {
                console.error(`[Photos] Cleanup remove error for ${folder.name}: ${rmErr.message}`);
                continue;
            }
            summary.deletedFolders.push(folder.name);
            summary.deletedFiles += paths.length;
        }
        if (summary.deletedFiles > 0) {
            console.log(`[Photos] Cleanup removed ${summary.deletedFiles} photos from ${summary.deletedFolders.length} day(s) older than ${cutoffStr}.`);
        }
    } catch (err) {
        console.error('[Photos] Cleanup failed:', err.message);
    }
    return summary;
}

/**
 * Start a once-a-day retention sweep. Safe to call on every boot; Cloud Run
 * instances that idle out simply stop the timer. Runs 2 minutes after boot
 * and then every 24 hours.
 */
function scheduleDailyCleanup() {
    if (process.env.ATTENDANCE_PHOTO_CLEANUP === 'off') return null;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const first = setTimeout(() => {
        cleanupExpiredPhotos();
        const timer = setInterval(cleanupExpiredPhotos, DAY_MS);
        if (timer.unref) timer.unref();
    }, 2 * 60 * 1000);
    if (first.unref) first.unref();
    return first;
}

module.exports = {
    BUCKET,
    RETENTION_DAYS,
    photoPath,
    isValidDate,
    isValidKind,
    isValidAttendanceId,
    saveAttendancePhoto,
    stampPhoto,
    formatStampTime,
    formatStampLocation,
    normalizeLocation,
    getPhotoLocation,
    makeAvatar,
    avatarPath,
    saveEmployeeAvatar,
    getAvatarUrls,
    listPhotoAvailability,
    getSignedPhotoUrl,
    getSignedPhotoUrlsForRows,
    cleanupExpiredPhotos,
    scheduleDailyCleanup,
    _setClientForTests,
};
