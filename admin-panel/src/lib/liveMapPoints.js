/** Pure helpers for the Live Map page (kept out of the component file for fast refresh + tests). */
export const GROUP_RADIUS_M = 25; // scans at the same door land in one marker

/** Latest known position of a row: the check-out fix if there is one, else the check-in fix. */
export function lastPoint(row) {
    if (row.out) return { ...row.out, kind: 'out' };
    if (row.in) return { ...row.in, kind: 'in' };
    return null;
}

/** Great-circle distance in metres. */
export function distanceM(a, b) {
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Group rows whose latest fix lies within GROUP_RADIUS_M of a group's centre.
 * Greedy, in row order; fine for a few dozen staff. Each group: { key, lat, lng, members:[{row, point}], present }.
 */
export function groupPoints(rows, radiusM = GROUP_RADIUS_M) {
    const groups = [];
    for (const row of rows) {
        const p = lastPoint(row);
        if (!p) continue;
        let g = groups.find(x => distanceM(x, p) <= radiusM);
        if (!g) { g = { key: `g${groups.length}`, lat: p.lat, lng: p.lng, members: [], present: 0 }; groups.push(g); }
        g.members.push({ row, point: p });
        g.lat = g.members.reduce((s, m) => s + m.point.lat, 0) / g.members.length;
        g.lng = g.members.reduce((s, m) => s + m.point.lng, 0) / g.members.length;
        if (!row.check_out) g.present += 1;
    }
    return groups;
}

/** The group that holds this employee's marker, or null. */
export function groupOf(groups, employeeId) {
    return groups.find(g => g.members.some(m => m.row.employee_id === employeeId)) || null;
}

/** "EngLabs Office" when inside a known place, "190 m from EngLabs Office" when near one, else null. */
export function placeLabel(point) {
    if (!point) return null;
    if (point.place) return point.place;
    const n = point.nearest_place;
    if (!n) return null;
    const d = n.distance_m >= 1000 ? `${(n.distance_m / 1000).toFixed(1)} km` : `${n.distance_m} m`;
    return `${d} from ${n.name}`;
}
