import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, ExternalLink, Calendar, Plus, Minus, Crosshair, ChevronUp, ChevronDown, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import useAvatars from '../hooks/useAvatars';
import CheckinCard from '../components/CheckinCard';
import { lastPoint, groupPoints, placeLabel } from '../lib/liveMapPoints';

/**
 * Live Map: the map is the page, everything else floats on it.
 * Search + filter chips top-left, the staff panel on the left (a bottom sheet
 * on phones), health chips top-right, map controls bottom-right, and a
 * person card when a pin or row is selected. Pins come from the terminal's GPS
 * fix at each scan; pins within 25 m (the office door) are grouped.
 */
const REFRESH_MS = 30 * 1000;
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmtClock = (iso) => (iso ? format(new Date(iso), 'HH:mm') : '—');
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const agoText = (ms) => (ms < 60000 ? `${Math.max(0, Math.round(ms / 1000))} s ago` : ms < 3600000 ? `${Math.round(ms / 60000)} min ago` : `${Math.round(ms / 3600000)} h ago`);

const TILES = {
    map: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 },
    satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 19 },
};
const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'in', label: 'In now' },
    { key: 'out', label: 'Checked out' },
    { key: 'offsite', label: 'Off-site' },
    { key: 'nogps', label: 'No GPS' },
];

const avatarHtml = (url, name, size) => (url
    ? `<img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9999px" />`
    : `<span style="font:700 ${Math.round(size * 0.3)}px Inter,system-ui,sans-serif;color:#0e4368">${escapeHtml(initials(name))}</span>`);

/** Cluster marker: count, how many are still in, and the place name when known. */
function clusterHtml(group) {
    const color = group.present > 0 ? '#52cca3' : '#f0b429';
    const place = group.members.map(m => m.point.place).find(Boolean);
    return `<div style="position:relative;width:64px;height:64px;border-radius:9999px;background:#fff;border:4px solid ${color};box-shadow:0 10px 24px rgba(14,67,104,.22);display:flex;flex-direction:column;align-items:center;justify-content:center">
        <span style="font:700 21px Outfit,Inter,system-ui,sans-serif;color:#0e4368;line-height:1">${group.members.length}</span>
        ${place ? `<span style="font:700 8px Inter,system-ui,sans-serif;letter-spacing:.08em;color:#6b7a8a;text-transform:uppercase;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(place)}</span>` : ''}
        ${group.present > 0 ? `<span style="position:absolute;right:-10px;top:-8px;background:#52cca3;color:#fff;font:700 11px Inter,system-ui,sans-serif;border-radius:9999px;padding:2px 8px;border:2px solid #fff;white-space:nowrap">${group.present} in</span>` : ''}
    </div>`;
}
/** One person's pin (off-site, or the selected person's IN / OUT). */
function personPinHtml({ row, point, avatarUrl, highlight }) {
    const color = point.kind === 'in' ? '#52cca3' : '#f0b429';
    const ring = highlight ? '#0e4368' : color;
    const at = point.kind === 'in' ? row.check_in : row.check_out;
    return `<div style="position:relative;width:50px;height:58px">
        <div style="width:50px;height:50px;border-radius:9999px;background:#fff;border:3px solid ${ring};box-shadow:0 8px 20px rgba(14,67,104,.25);display:flex;align-items:center;justify-content:center;overflow:hidden">${avatarHtml(avatarUrl, row.name, 50)}</div>
        <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${ring}"></div>
        <span style="position:absolute;right:-14px;top:-8px;background:${color};color:#fff;font:700 9px Inter,system-ui,sans-serif;letter-spacing:.08em;border-radius:6px;padding:2px 6px;border:2px solid #fff;white-space:nowrap">${point.kind.toUpperCase()} ${fmtClock(at)}</span>
    </div>`;
}

export default function LiveMap() {
    const navigate = useNavigate();
    const [date, setDate] = useState(todayIST);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [now, setNow] = useState(Date.now());
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(null);
    const [cardKind, setCardKind] = useState('in');
    const [tiles, setTiles] = useState('map');
    const [sheetOpen, setSheetOpen] = useState(false);
    const [health, setHealth] = useState({ engine: null, door: null });

    const avatars = useAvatars(rows.map(r => r.employee_id));
    const groups = useMemo(() => groupPoints(rows), [rows]);
    const selectedRow = useMemo(() => rows.find(r => r.employee_id === selected) || null, [rows, selected]);
    const isToday = date === todayIST();

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiService.getAttendanceLocations(date);
            setRows(Array.isArray(data?.rows) ? data.rows : []);
            setUpdatedAt(Date.now());
            setError(null);
        } catch (err) {
            setError(err?.response?.data?.error || 'Could not load locations.');
        } finally { setLoading(false); }
    }, [date]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!isToday) return;
        const t = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(t);
    }, [isToday, load]);
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    useEffect(() => {
        let stop = false;
        const check = async () => {
            const [engine, door] = await Promise.all([
                apiService.getEngineHealth().then(d => d?.status === 'ready').catch(() => false),
                apiService.getDoorStatus().then(d => d).catch(() => null),
            ]);
            if (!stop) setHealth({ engine, door });
        };
        check();
        const t = setInterval(check, 60000);
        return () => { stop = true; clearInterval(t); };
    }, []);

    const select = useCallback((row) => {
        if (!row) { setSelected(null); return; }
        setSelected(row.employee_id);
        setCardKind(row.check_out && row.out ? 'out' : 'in');
        setSheetOpen(true);
    }, []);

    // ── Leaflet ──
    const mapEl = useRef(null);
    const mapRef = useRef(null);
    const tileRef = useRef(null);
    const layerRef = useRef(null);
    const personLayerRef = useRef(null);
    const rowsRef = useRef(rows);
    rowsRef.current = rows;

    useEffect(() => {
        if (!mapEl.current || mapRef.current) return;
        const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
        tileRef.current = L.tileLayer(TILES.map.url, { maxZoom: TILES.map.maxZoom, attribution: TILES.map.attribution }).addTo(map);
        map.setView([20.5937, 78.9629], 5);
        layerRef.current = L.layerGroup().addTo(map);
        personLayerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        const onClick = (e) => {
            const el = e.target.closest?.('[data-eid]');
            if (!el) return;
            const row = rowsRef.current.find(r => r.employee_id === el.getAttribute('data-eid'));
            if (row) select(row);
        };
        const container = map.getContainer();
        container.addEventListener('click', onClick);
        return () => { container.removeEventListener('click', onClick); map.remove(); mapRef.current = null; layerRef.current = null; personLayerRef.current = null; };
    }, [select]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        if (tileRef.current) map.removeLayer(tileRef.current);
        const t = TILES[tiles] || TILES.map;
        tileRef.current = L.tileLayer(t.url, { maxZoom: t.maxZoom, attribution: t.attribution }).addTo(map);
        tileRef.current.bringToBack?.();
    }, [tiles]);

    // group markers (everyone), single pins for anyone off-site
    useEffect(() => {
        const map = mapRef.current, layer = layerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        for (const g of groups) {
            if (g.members.length === 1) {
                const { row, point } = g.members[0];
                L.marker([point.lat, point.lng], {
                    icon: L.divIcon({ html: personPinHtml({ row, point, avatarUrl: avatars[row.employee_id] }), className: 'live-map-marker', iconSize: [50, 58], iconAnchor: [25, 58] }),
                    title: row.name,
                }).on('click', () => select(row)).addTo(layer);
                continue;
            }
            const popup = `<div style="min-width:220px;font-family:Inter,system-ui,sans-serif">
                <div style="font:800 10px Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:6px">${g.members.length} people · ${g.present} in</div>
                ${g.members.map(({ row }) => `<div data-eid="${escapeHtml(row.employee_id)}" role="button" style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid #e2e8f0;cursor:pointer">
                    <span style="font-weight:700;color:#0f172a;font-size:13px">${escapeHtml(row.name)}</span>
                    <span style="font:600 11px ui-monospace,monospace;color:#334155"><span style="color:#10b981">IN</span> ${fmtClock(row.check_in)} · <span style="color:#f59e0b">OUT</span> ${fmtClock(row.check_out)}</span>
                </div>`).join('')}
            </div>`;
            L.marker([g.lat, g.lng], {
                icon: L.divIcon({ html: clusterHtml(g), className: 'live-map-marker', iconSize: [64, 64], iconAnchor: [32, 32], popupAnchor: [0, -34] }),
                title: g.members.map(m => m.row.name).join(', '),
            }).bindPopup(popup, { maxWidth: 320 }).addTo(layer);
        }
        if (groups.length && !selectedRow) map.fitBounds(L.latLngBounds(groups.map(g => [g.lat, g.lng])).pad(0.3), { maxZoom: 17, animate: false });
    }, [groups, avatars, select, selectedRow]);

    // selected person: own IN / OUT pins + dashed trail
    useEffect(() => {
        const map = mapRef.current, layer = personLayerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        if (!selectedRow) return;
        const pts = ['in', 'out'].filter(k => selectedRow[k]).map(k => ({ kind: k, ...selectedRow[k] }));
        if (!pts.length) return;
        for (const p of pts) {
            L.marker([p.lat, p.lng], {
                icon: L.divIcon({ html: personPinHtml({ row: selectedRow, point: p, avatarUrl: avatars[selectedRow.employee_id], highlight: true }), className: 'live-map-marker', iconSize: [50, 58], iconAnchor: [25, 58] }),
                title: `${selectedRow.name} ${p.kind === 'in' ? 'check-in' : 'check-out'}`, zIndexOffset: 1000,
            }).on('click', () => setCardKind(p.kind)).addTo(layer);
        }
        if (pts.length === 2) L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#0e4368', weight: 3, dashArray: '7 8', opacity: 0.8 }).addTo(layer);
        map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng])).pad(0.5), { maxZoom: 18, animate: true });
    }, [selectedRow, avatars]);

    const fitAll = () => {
        const map = mapRef.current;
        if (!map || !groups.length) return;
        map.fitBounds(L.latLngBounds(groups.map(g => [g.lat, g.lng])).pad(0.3), { maxZoom: 17 });
    };

    // ── derived ──
    const counts = {
        all: rows.length,
        in: rows.filter(r => !r.check_out).length,
        out: rows.filter(r => r.check_out).length,
        offsite: rows.filter(r => { const p = lastPoint(r); return p && !p.place; }).length,
        nogps: rows.filter(r => !lastPoint(r)).length,
    };
    const located = rows.filter(r => lastPoint(r)).length;
    const q = query.trim().toLowerCase();
    const visible = rows
        .filter(r => filter === 'all' ? true : filter === 'in' ? !r.check_out : filter === 'out' ? !!r.check_out : filter === 'offsite' ? (lastPoint(r) && !lastPoint(r).place) : !lastPoint(r))
        .filter(r => !q || [r.name, r.employee_id, r.department, lastPoint(r)?.address, placeLabel(lastPoint(r))].some(v => String(v || '').toLowerCase().includes(q)))
        .sort((a, b) => String(b.check_out || b.check_in || '').localeCompare(String(a.check_out || a.check_in || '')));
    const gpsAge = (() => {
        const times = rows.flatMap(r => [r.in?.fix_time, r.out?.fix_time]).filter(Boolean).map(t => new Date(t).getTime());
        return times.length ? now - Math.max(...times) : null;
    })();
    const doorOnline = health.door ? (health.door.online ?? health.door.connected ?? null) : null;
    const doorLocked = health.door ? (health.door.locked ?? (health.door.status === 'locked' ? true : null)) : null;

    const rowSubtitle = (r) => {
        const p = lastPoint(r);
        const bits = [r.department, r.employee_id].filter(Boolean).join(' · ');
        if (!p) return `${bits} · No GPS on this scan`;
        return `${bits} · ${placeLabel(p) || p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`}`;
    };

    const listPanel = (
        <>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
                <div>
                    <div className="font-display text-[17px] font-bold text-slate-900">{isToday ? 'Today' : format(new Date(date + 'T00:00:00'), 'dd MMM yyyy')}{isToday ? `, ${format(new Date(), 'dd MMM')}` : ''}</div>
                    <div className="text-[11px] text-slate-500">{located} located of {rows.length} present{updatedAt ? ` · updated ${agoText(now - updatedAt)}` : ''}</div>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
                    <Calendar className="w-3.5 h-3.5" />
                    <input type="date" value={date} max={todayIST()} aria-label="Date" onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSelected(null); } }} className="bg-transparent outline-none font-mono text-slate-700 w-[118px]" />
                </label>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
                {loading && rows.length === 0 && <div className="p-8 text-center text-slate-400 text-xs font-semibold flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
                {!loading && rows.length === 0 && !error && <div className="p-8 text-center text-slate-400 text-xs font-semibold">Nobody has checked in on this date.</div>}
                {!loading && rows.length > 0 && visible.length === 0 && <div className="p-8 text-center text-slate-400 text-xs font-semibold">No one matches this filter.</div>}
                {error && <div className="p-4 text-xs font-semibold text-red-600">{error}</div>}
                {visible.map(row => {
                    const p = lastPoint(row);
                    const active = selected === row.employee_id;
                    return (
                        <div key={row.employee_id} role="button" tabIndex={0} onClick={() => select(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(row); } }}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${active ? 'bg-brand-navy/[0.07] border-l-[3px] border-brand-navy' : 'hover:bg-slate-50 border-l-[3px] border-transparent'} ${p ? '' : 'opacity-70'}`}>
                            <div className={`w-11 h-11 rounded-full border-2 shrink-0 overflow-hidden flex items-center justify-center bg-slate-50 font-bold text-xs text-brand-navy ${!p ? 'border-dashed border-slate-300' : row.check_out ? 'border-amber-400' : 'border-brand-teal'}`}>
                                {avatars[row.employee_id] ? <img src={avatars[row.employee_id]} alt="" className="w-full h-full object-cover" /> : initials(row.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-900 truncate">{row.name}</div>
                                <div className="text-[11px] text-slate-500 truncate">{rowSubtitle(row)}</div>
                            </div>
                            <div className="text-right text-[11px] font-mono text-slate-600 shrink-0 leading-tight">
                                <div><span className="text-emerald-600 font-bold">IN</span> {fmtClock(row.check_in)}</div>
                                <div><span className="text-amber-600 font-bold">OUT</span> {fmtClock(row.check_out)}</div>
                            </div>
                            <button type="button" aria-label={`Open ${row.name} attendance`} onClick={(e) => { e.stopPropagation(); navigate(`/admin/attendance/employee/${row.employee_id}`); }}
                                className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-brand-navy hover:bg-white flex items-center justify-center shrink-0">
                                <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </>
    );

    return (
        <div className="fixed left-0 md:left-[260px] right-0 top-16 md:top-0 bottom-0 z-30 bg-slate-100 overflow-hidden">
            <div ref={mapEl} className="absolute inset-0" role="region" aria-label="Map of check-in locations" />

            {/* top-left: search + filters */}
            <div className="absolute left-4 top-4 w-[400px] max-w-[calc(100%-2rem)] flex flex-col gap-2.5 z-[600]">
                <label className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(11,30,54,0.10)]">
                    <Search className="w-5 h-5 text-slate-400 shrink-0" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff, site or address" aria-label="Search staff"
                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400" />
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${isToday ? 'bg-brand-teal/15 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        <span className={`w-2 h-2 rounded-full ${isToday ? 'bg-brand-teal' : 'bg-slate-400'}`} />{isToday ? 'LIVE' : 'HISTORY'}
                    </span>
                </label>
                <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                    {FILTERS.map(f => (
                        <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                            className={`whitespace-nowrap text-[12px] font-semibold px-3.5 py-1.5 rounded-full border transition-all ${filter === f.key ? 'bg-brand-navy text-white border-brand-navy shadow-[0_6px_16px_rgba(14,67,104,0.2)]' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'}`}>
                            {f.label} · {counts[f.key]}
                        </button>
                    ))}
                </div>
            </div>

            {/* desktop: left staff panel */}
            <div className="hidden md:flex absolute left-4 top-[124px] bottom-4 w-[400px] bg-white border border-slate-200 rounded-[20px] shadow-[0_16px_40px_rgba(11,30,54,0.10)] flex-col overflow-hidden z-[600]">
                {listPanel}
            </div>

            {/* phone: bottom sheet */}
            <div className={`md:hidden absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl shadow-[0_-12px_40px_rgba(11,30,54,0.14)] flex flex-col z-[600] transition-[height] ${sheetOpen ? 'h-[62vh]' : 'h-[132px]'}`}>
                <button type="button" onClick={() => setSheetOpen(o => !o)} aria-label={sheetOpen ? 'Collapse' : 'Expand'} className="flex flex-col items-center pt-2 pb-1 shrink-0">
                    <span className="w-10 h-1 rounded-full bg-slate-300" />
                    {sheetOpen ? <ChevronDown className="w-4 h-4 text-slate-400 mt-1" /> : <ChevronUp className="w-4 h-4 text-slate-400 mt-1" />}
                </button>
                {selectedRow ? null : listPanel}
            </div>

            {/* person card: right panel on desktop, inside the sheet on phones */}
            {selectedRow && (
                <div className="absolute z-[650] bg-white border border-slate-200 shadow-[0_16px_40px_rgba(11,30,54,0.12)] overflow-hidden flex flex-col md:right-4 md:top-[72px] md:w-[380px] md:max-h-[calc(100%-96px)] md:rounded-[20px] left-0 right-0 bottom-0 max-h-[62vh] rounded-t-3xl md:left-auto md:bottom-auto">
                    <CheckinCard key={selectedRow.employee_id} row={selectedRow} kind={cardKind} onKind={setCardKind} avatarUrl={avatars[selectedRow.employee_id]} onClose={() => setSelected(null)} />
                </div>
            )}

            {/* top-right: health chips */}
            <div className="hidden md:flex absolute right-4 top-4 gap-2 z-[600]">
                {[
                    { label: 'Engine', ok: health.engine, text: health.engine == null ? 'Engine' : health.engine ? 'Engine ready' : 'Engine offline' },
                    { label: 'Door', ok: doorOnline, text: doorOnline == null ? 'Door' : doorOnline ? (doorLocked === false ? 'Door unlocked' : 'Door locked') : 'Door offline' },
                    { label: 'GPS', ok: gpsAge == null ? null : gpsAge < 15 * 60000, text: gpsAge == null ? 'Tablet GPS' : `Tablet GPS ${agoText(gpsAge)}` },
                ].map(c => (
                    <span key={c.label} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1.5 text-[11px] font-semibold text-slate-600 shadow-[0_6px_16px_rgba(11,30,54,0.08)]">
                        <span className={`w-2 h-2 rounded-full ${c.ok == null ? 'bg-slate-300' : c.ok ? 'bg-brand-teal' : 'bg-amber-400'}`} />{c.text}
                    </span>
                ))}
            </div>

            {/* bottom-right: map controls */}
            <div className={`absolute right-4 flex flex-col items-end gap-2 z-[600] ${selectedRow || sheetOpen ? 'bottom-[64vh] md:bottom-10' : 'bottom-[148px] md:bottom-10'}`}>
                <div className="flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-[0_8px_20px_rgba(11,30,54,0.10)]">
                    {['map', 'satellite'].map(k => (
                        <button key={k} type="button" onClick={() => setTiles(k)} aria-pressed={tiles === k}
                            className={`text-[11px] font-bold px-3 py-1.5 rounded-lg ${tiles === k ? 'bg-brand-navy text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{k === 'map' ? 'Map' : 'Satellite'}</button>
                    ))}
                </div>
                <div className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-[0_8px_20px_rgba(11,30,54,0.10)] overflow-hidden">
                    <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="w-11 h-11 flex items-center justify-center text-slate-800 border-b border-slate-100 hover:bg-slate-50"><Plus className="w-4 h-4" /></button>
                    <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="w-11 h-11 flex items-center justify-center text-slate-800 hover:bg-slate-50"><Minus className="w-4 h-4" /></button>
                </div>
                <button type="button" aria-label="Show everyone" onClick={() => { setSelected(null); fitAll(); }} className="w-11 h-11 bg-white border border-slate-200 rounded-xl shadow-[0_8px_20px_rgba(11,30,54,0.10)] flex items-center justify-center text-brand-navy hover:bg-slate-50"><Crosshair className="w-5 h-5" /></button>
            </div>

            {/* legend (desktop) */}
            <div className="hidden md:flex absolute left-[428px] bottom-4 items-center gap-4 bg-white/95 border border-slate-200 rounded-xl px-3.5 py-2 text-[11px] font-semibold text-slate-600 shadow-[0_6px_16px_rgba(11,30,54,0.08)] z-[600]">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-[3px] border-brand-teal bg-white" />in now</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-[3px] border-amber-400 bg-white" />checked out</span>
                <span className="flex items-center gap-1.5"><span className="w-[18px] border-t-2 border-dashed border-brand-navy" />today's trail</span>
                {groups.length === 0 && !loading && <span className="flex items-center gap-1.5 text-slate-400"><MapPin className="w-3 h-3" />no GPS fixes for this date</span>}
            </div>
            {updatedAt && <span className="absolute right-4 bottom-[6px] md:bottom-1 z-[600] text-[10px] text-slate-500 bg-white/90 px-2 py-0.5 rounded">updated {agoText(now - updatedAt)}</span>}
        </div>
    );
}
