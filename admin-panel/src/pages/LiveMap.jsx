import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
    MapPin, RefreshCw, Loader2, Users, LogIn, LogOut, Navigation,
    AlertTriangle, ExternalLink, Calendar, Crosshair
} from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import useAvatars from '../hooks/useAvatars';
import { lastPoint, groupPoints, groupOf } from '../lib/liveMapPoints';

/**
 * Live Map (phase 1): where each staff member checked in / out today, from the
 * GPS fix the terminal sends with every scan. Pins at the same spot (the office
 * door) are grouped into one marker with a count. Phase 2 (staff phone
 * tracking between check-in and check-out) needs signed consent forms first.
 */
const REFRESH_MS = 60 * 1000;

// IST calendar date as yyyy-MM-dd (matches the backend's "today")
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmtTime = (iso) => iso ? format(new Date(iso), 'HH:mm:ss') : '—';
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

function markerHtml(group, avatars) {
    const single = group.members.length === 1;
    const color = group.present > 0 ? '#10b981' : '#f59e0b'; // emerald = someone still in, amber = all checked out
    const first = group.members[0].row;
    const avatar = avatars[first.employee_id];
    const face = single
        ? (avatar
            ? `<img src="${escapeHtml(avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:9999px" />`
            : `<span style="font:700 13px Inter,system-ui,sans-serif;color:#0e4368">${escapeHtml(initials(first.name))}</span>`)
        : `<span style="font:800 15px Inter,system-ui,sans-serif;color:#0e4368">${group.members.length}</span>`;
    const badge = single ? '' : `<span style="position:absolute;right:-4px;top:-4px;background:${color};color:#fff;font:800 10px Inter,system-ui,sans-serif;border-radius:9999px;padding:1px 6px;border:2px solid #fff">${group.present}</span>`;
    return `<div style="position:relative;width:46px;height:46px;border-radius:9999px;background:#fff;border:3px solid ${color};box-shadow:0 6px 16px rgba(14,67,104,.25);display:flex;align-items:center;justify-content:center;overflow:visible">${face}${badge}</div>`;
}

function popupHtml(group) {
    const rows = group.members.map(({ row, point }) => `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid #e2e8f0">
            <div style="min-width:0">
                <div style="font-weight:700;color:#0f172a;font-size:13px">${escapeHtml(row.name)}</div>
                <div style="font:500 10px ui-monospace,monospace;color:#64748b">${escapeHtml(row.employee_id)}${row.department ? ' · ' + escapeHtml(row.department) : ''}</div>
            </div>
            <div style="text-align:right;font:600 11px ui-monospace,monospace;color:#334155;white-space:nowrap">
                <div><span style="color:#10b981">IN</span> ${fmtTime(row.check_in)}</div>
                <div><span style="color:#f59e0b">OUT</span> ${fmtTime(row.check_out)}</div>
                <div style="color:#94a3b8">${point.kind === 'out' ? 'check-out fix' : 'check-in fix'}${point.accuracy_m != null ? ` · ±${point.accuracy_m} m` : ''}</div>
            </div>
        </div>`).join('');
    return `
        <div style="min-width:240px;font-family:Inter,system-ui,sans-serif">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font:800 10px Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#64748b">${group.members.length} ${group.members.length === 1 ? 'person' : 'people'} · ${group.present} in</span>
                <a href="${mapsLink(group.lat.toFixed(6), group.lng.toFixed(6))}" target="_blank" rel="noopener noreferrer" style="font:700 11px Inter,system-ui,sans-serif;color:#0e4368">Google Maps ↗</a>
            </div>
            ${rows}
            <div style="font:500 10px ui-monospace,monospace;color:#94a3b8;margin-top:6px">${group.lat.toFixed(5)}, ${group.lng.toFixed(5)}</div>
        </div>`;
}

export default function LiveMap() {
    const navigate = useNavigate();
    const [date, setDate] = useState(todayIST);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selected, setSelected] = useState(null);

    const avatars = useAvatars(rows.map(r => r.employee_id));
    const groups = useMemo(() => groupPoints(rows), [rows]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiService.getAttendanceLocations(date);
            setRows(Array.isArray(data?.rows) ? data.rows : []);
            setUpdatedAt(new Date());
            setError(null);
        } catch (err) {
            setError(err?.response?.data?.error || 'Could not load locations.');
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!autoRefresh || date !== todayIST()) return;
        const t = setInterval(() => load(true), REFRESH_MS);
        return () => clearInterval(t);
    }, [autoRefresh, date, load]);

    // ── Leaflet map: created once, markers rebuilt whenever the data changes ──
    const mapEl = useRef(null);
    const mapRef = useRef(null);
    const layerRef = useRef(null);
    const markersRef = useRef(new Map()); // group key -> marker

    useEffect(() => {
        if (!mapEl.current || mapRef.current) return;
        const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        map.setView([20.5937, 78.9629], 5); // India, until the first fix arrives
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
    }, []);

    useEffect(() => {
        const map = mapRef.current, layer = layerRef.current;
        if (!map || !layer) return;
        layer.clearLayers();
        markersRef.current = new Map();
        if (groups.length === 0) return;
        for (const g of groups) {
            const marker = L.marker([g.lat, g.lng], {
                icon: L.divIcon({ html: markerHtml(g, avatars), className: 'live-map-marker', iconSize: [46, 46], iconAnchor: [23, 23], popupAnchor: [0, -26] }),
                title: g.members.map(m => m.row.name).join(', '),
            }).bindPopup(popupHtml(g), { maxWidth: 320 });
            marker.addTo(layer);
            markersRef.current.set(g.key, marker);
        }
        const bounds = L.latLngBounds(groups.map(g => [g.lat, g.lng]));
        map.fitBounds(bounds.pad(0.3), { maxZoom: 17, animate: false });
    }, [groups, avatars]);

    const focus = (row) => {
        const p = lastPoint(row);
        if (!p) return;
        setSelected(row.employee_id);
        const g = groupOf(groups, row.employee_id);
        const marker = g ? markersRef.current.get(g.key) : null;
        const map = mapRef.current;
        if (map) map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 17), { duration: 0.6 });
        if (marker) marker.openPopup();
    };

    const withFix = rows.filter(r => lastPoint(r));
    const inNow = rows.filter(r => !r.check_out).length;
    const sorted = [...rows].sort((a, b) => {
        const fa = lastPoint(a) ? 0 : 1, fb = lastPoint(b) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return String(b.check_out || b.check_in || '').localeCompare(String(a.check_out || a.check_in || ''));
    });
    const isToday = date === todayIST();

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 tracking-tighter">Live Map</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">
                        Where staff checked in &amp; out // <span className="text-emerald-500">{withFix.length}</span> located of {rows.length} present
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        <input type="date" value={date} max={todayIST()} onChange={(e) => e.target.value && setDate(e.target.value)}
                            aria-label="Date" className="bg-transparent outline-none text-slate-800 font-mono" />
                    </label>
                    <button type="button" onClick={() => setAutoRefresh(v => !v)} disabled={!isToday}
                        aria-pressed={autoRefresh}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all disabled:opacity-40 ${autoRefresh && isToday ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                        Auto-refresh {autoRefresh && isToday ? 'on' : 'off'}
                    </button>
                    <button type="button" onClick={() => load()} disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light transition-all disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
                    </button>
                </div>
            </div>

            {/* ── Stats ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Present', value: rows.length, icon: Users, tone: 'text-brand-navy bg-brand-navy/[0.07]' },
                    { label: 'Located', value: withFix.length, icon: Crosshair, tone: 'text-emerald-600 bg-emerald-500/10' },
                    { label: 'In now', value: inNow, icon: LogIn, tone: 'text-emerald-600 bg-emerald-500/10' },
                    { label: 'Checked out', value: rows.length - inNow, icon: LogOut, tone: 'text-amber-600 bg-amber-500/10' },
                ].map(s => (
                    <div key={s.label} className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.tone}`}><s.icon className="w-5 h-5" /></div>
                        <div>
                            <div className="text-2xl font-black text-slate-900 leading-none">{s.value}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {error && (
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
                    <AlertTriangle className="w-4 h-4" /> {error}
                </div>
            )}

            {/* ── Map + list ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden relative">
                    <div ref={mapEl} className="h-[420px] md:h-[560px] w-full" role="region" aria-label="Map of check-in locations" />
                    {!loading && groups.length === 0 && (
                        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-none">
                            <div className="text-center px-6">
                                <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <div className="text-sm font-bold text-slate-700">No GPS fixes for this date yet</div>
                                <div className="text-xs text-slate-500 mt-1">Positions appear as soon as a scan with a fresh GPS fix comes in from the terminal.</div>
                            </div>
                        </div>
                    )}
                    <div className="absolute left-3 bottom-3 z-[500] flex items-center gap-3 px-3 py-2 rounded-xl bg-white/90 border border-slate-200 text-[10px] font-bold text-slate-600 shadow">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-[3px] border-emerald-500 bg-white" /> someone still in</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-[3px] border-amber-500 bg-white" /> all checked out</span>
                    </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200 flex flex-col max-h-[560px]">
                    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Staff · {date}</div>
                        {updatedAt && <div className="text-[10px] font-mono text-slate-400">updated {format(updatedAt, 'HH:mm:ss')}</div>}
                    </div>
                    <div className="overflow-y-auto divide-y divide-slate-100">
                        {loading && rows.length === 0 && (
                            <div className="p-8 text-center text-slate-400 text-xs font-semibold flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
                        )}
                        {!loading && rows.length === 0 && !error && (
                            <div className="p-8 text-center text-slate-400 text-xs font-semibold">Nobody has checked in on this date.</div>
                        )}
                        {sorted.map(row => {
                            const p = lastPoint(row);
                            const active = selected === row.employee_id;
                            return (
                                <div key={row.employee_id}
                                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${p ? 'cursor-pointer hover:bg-slate-50' : 'opacity-70'} ${active ? 'bg-brand-navy/[0.05]' : ''}`}
                                    onClick={() => focus(row)} role={p ? 'button' : undefined} tabIndex={p ? 0 : undefined}
                                    onKeyDown={(e) => { if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focus(row); } }}>
                                    <div className={`w-10 h-10 rounded-full border-2 shrink-0 overflow-hidden flex items-center justify-center bg-slate-50 font-bold text-xs text-brand-navy ${row.check_out ? 'border-amber-400' : 'border-emerald-500'}`}>
                                        {avatars[row.employee_id] ? <img src={avatars[row.employee_id]} alt="" className="w-full h-full object-cover" /> : initials(row.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-bold text-slate-900 truncate">{row.name}</div>
                                        <div className="text-[10px] font-mono text-slate-500 truncate">{row.employee_id}{row.department ? ` · ${row.department}` : ''}</div>
                                    </div>
                                    <div className="text-right text-[11px] font-mono text-slate-600 shrink-0">
                                        <div><span className="text-emerald-500 font-bold">IN</span> {fmtTime(row.check_in)}</div>
                                        <div><span className="text-amber-500 font-bold">OUT</span> {fmtTime(row.check_out)}</div>
                                        {p
                                            ? <div className="text-[10px] text-slate-400">{p.kind === 'out' ? 'out fix' : 'in fix'}{p.accuracy_m != null ? ` ±${p.accuracy_m} m` : ''}</div>
                                            : <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No GPS</div>}
                                    </div>
                                    <button type="button" aria-label={`Open ${row.name} attendance`}
                                        onClick={(e) => { e.stopPropagation(); navigate(`/admin/attendance/employee/${row.employee_id}`); }}
                                        className="w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-brand-navy hover:bg-slate-50 flex items-center justify-center shrink-0">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-brand-navy/[0.04] border border-brand-navy/10 text-xs text-slate-600">
                <Navigation className="w-4 h-4 text-brand-navy shrink-0 mt-0.5" />
                <div>
                    <span className="font-bold text-brand-navy">Phase 1.</span> Each pin is the terminal's GPS fix at the moment of the face scan, so today it shows where people checked in and out.
                    Live movement between check-in and check-out (staff phone app, every few minutes, duty hours only) is phase 2 and starts once the location consent forms are signed.
                </div>
            </div>
        </div>
    );
}
