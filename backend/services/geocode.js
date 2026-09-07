/**
 * Reverse geocoding (coordinates -> street address) for the Live Map cards.
 *
 * Uses OpenStreetMap Nominatim, which is free and needs no key but asks for
 * at most one request per second and an identifying User-Agent. Requests are
 * serialised with a 1.1 s gap and results are cached in memory per ~11 m cell;
 * the caller also persists the address into the photo's GPS sidecar so each
 * spot is looked up once, ever.
 */
const axios = require('axios');

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'EngLabs-Attendance/2.2 (+https://github.com/barrydeveloperindia-arch/aura-lock-2)';
const MIN_GAP_MS = 1100;
const cache = new Map(); // "lat,lng" (4 dp) -> address string

/**
 * Named places the company knows (office, workshop, client sites), as JSON in
 * KNOWN_PLACES: [{"name":"EngLabs Office","lat":30.7218,"lng":76.8525,"radius_m":120}]
 * or the compact form  EngLabs Office@30.7218,76.8525,120;Site B@lat,lng,radius.
 * OpenStreetMap has no street names for some Indian lanes, so a fix inside a
 * known place is labelled with that name first.
 */
let knownPlaces = parseKnownPlaces(process.env.KNOWN_PLACES);
function parseKnownPlaces(json) {
    // Compact form (no quotes, safe to pass through PowerShell / gcloud):
    //   EngLabs Office@30.72182,76.85247,120;Client Site@30.70,76.80,150
    if (typeof json === "string" && json.includes("@") && !json.trim().startsWith("[")) {
        return json.split(";").map(item => {
            const [name, rest] = item.split("@");
            const [lat, lng, radius] = (rest || "").split(",");
            return { name: (name || "").trim(), lat: Number(lat), lng: Number(lng), radius_m: Number(radius) > 0 ? Number(radius) : 100 };
        }).filter(p => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    }
    try {
        const list = JSON.parse(json || "[]");
        return Array.isArray(list) ? list.filter(p => p && p.name && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
            .map(p => ({ name: String(p.name), lat: Number(p.lat), lng: Number(p.lng), radius_m: Number(p.radius_m) > 0 ? Number(p.radius_m) : 100 })) : [];
    } catch (_e) { console.warn("[Geocode] KNOWN_PLACES is not valid JSON, ignoring"); return []; }
}
function distanceM(aLat, aLng, bLat, bLng) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
/** Nearest known place regardless of radius: { name, distance_m, inside } or null when none configured. */
function nearestPlace(lat, lng) {
    let best = null;
    for (const p of knownPlaces) {
        const d = distanceM(lat, lng, p.lat, p.lng);
        if (!best || d < best.distance_m) best = { name: p.name, distance_m: Math.round(d), inside: d <= p.radius_m };
    }
    return best;
}
/** Name of the nearest known place containing the point, or null. */
function knownPlace(lat, lng) {
    let best = null;
    for (const p of knownPlaces) {
        const d = distanceM(lat, lng, p.lat, p.lng);
        if (d <= p.radius_m && (!best || d < best.d)) best = { name: p.name, d };
    }
    return best ? best.name : null;
}
let http = axios;
let queue = Promise.resolve();
let lastRequestAt = 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cellKey = (lat, lng) => `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;

/**
 * Short, readable address from a Nominatim jsonv2 response:
 * "613 Franklin Ave, Fulton Street, Brooklyn, NY 11238, USA"-style, without the
 * neighbourhood noise Nominatim's display_name carries.
 */
function formatAddress(data) {
    const a = data?.address;
    if (!a) return typeof data?.display_name === 'string' && data.display_name.trim() ? data.display_name.trim() : null;
    const feature = typeof data.name === 'string' ? data.name.trim() : '';
    const line1 = [a.house_number, a.road || a.pedestrian || a.footway || a.residential].filter(Boolean).join(' ');
    const locality = a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village;
    const city = a.city || a.town || a.municipality || a.county;
    const region = [a.state, a.postcode].filter(Boolean).join(' ');
    const parts = [feature, line1, locality, city, region, a.country].map(s => (s || '').trim()).filter(Boolean);
    // drop exact duplicates (e.g. village == city)
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    return unique.length ? unique.join(', ') : (data.display_name || null);
}

/** Address for a coordinate, or null when the service fails. Never throws. */
async function reverseGeocode(lat, lng) {
    const la = Number(lat), ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
    const key = cellKey(la, ln);
    if (cache.has(key)) return cache.get(key);
    const place = knownPlace(la, ln);

    const run = async () => {
        const wait = lastRequestAt + MIN_GAP_MS - Date.now();
        if (wait > 0) await sleep(wait);
        lastRequestAt = Date.now();
        const { data } = await http.get(NOMINATIM_URL, {
            params: { lat: la, lon: ln, format: 'jsonv2', zoom: 18, 'accept-language': 'en' },
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            timeout: 8000,
        });
        const addr = formatAddress(data);
        return place ? (addr ? `${place}, ${addr}` : place) : addr;
    };
    // one request at a time, in arrival order; a failure must not poison the queue
    const job = queue.then(run, run);
    queue = job.catch(() => {});
    try {
        const address = await job;
        if (address) cache.set(key, address);
        return address;
    } catch (err) {
        console.warn(`[Geocode] ${key}: ${err.message}`);
        return place; // the company label still helps when OSM is unreachable
    }
}

function _setHttpForTests(client) { http = client || axios; cache.clear(); lastRequestAt = 0; queue = Promise.resolve(); }
function _setKnownPlacesForTests(json) { knownPlaces = parseKnownPlaces(json); cache.clear(); }

module.exports = { reverseGeocode, formatAddress, cellKey, knownPlace, nearestPlace, parseKnownPlaces, _setHttpForTests, _setKnownPlacesForTests };
