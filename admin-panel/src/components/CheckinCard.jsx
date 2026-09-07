import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, MapPin, ExternalLink, Camera, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

import { apiService } from '../services/api';
import { placeLabel } from '../lib/liveMapPoints';

/**
 * One check-in / check-out event as a card: the frame the terminal captured,
 * the street address (reverse-geocoded from the terminal GPS), the exact time,
 * the coordinates, today's trail and the person. Used by the Live Map when a
 * staff member is selected.
 *
 * Props: row (a Live Map row), kind 'in' | 'out', onKind(kind), avatarUrl, onClose
 */
const fmtClock = (iso) => (iso ? format(new Date(iso), 'HH:mm') : '—');
const initialsOf = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function CheckinCard({ row, kind, onKind, avatarUrl, onClose }) {
    const navigate = useNavigate();
    const [fetched, setFetched] = useState({ tag: null, photo: null, error: null });
    const tag = row ? `${row.attendance_id}/${kind}` : null;

    useEffect(() => {
        if (!tag) return;
        let cancelled = false;
        const [id, k] = tag.split('/');
        apiService.getAttendancePhoto(id, k)
            .then(photo => { if (!cancelled) setFetched({ tag, photo, error: null }); })
            .catch(err => {
                if (cancelled) return;
                const msg = err?.response?.status === 404 ? 'No photo was stored for this event.' : (err?.response?.data?.error || 'Could not load photo.');
                setFetched({ tag, photo: null, error: msg });
            });
        return () => { cancelled = true; };
    }, [tag]);

    if (!row) return null;
    const loading = fetched.tag !== tag;
    const photo = loading ? null : fetched.photo;
    const isIn = kind === 'in';
    const point = isIn ? row.in : row.out;
    const at = isIn ? row.check_in : row.check_out;
    const address = photo?.address || point?.address || null;
    const where = placeLabel(point);
    const hasIn = !!row.check_in, hasOut = !!row.check_out;

    return (
        <div className="flex flex-col max-h-full">
            {/* Photo */}
            <div className="relative bg-slate-900 aspect-[4/3] flex items-center justify-center shrink-0">
                {loading && <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />}
                {!loading && fetched.error && (
                    <div className="flex flex-col items-center gap-2 text-slate-300 px-6 text-center">
                        <Camera className="w-6 h-6" /><span className="text-xs font-semibold">{fetched.error}</span>
                    </div>
                )}
                {photo?.url && <img src={photo.url} alt={`${row.name} ${isIn ? 'check-in' : 'check-out'}`} className="w-full h-full object-cover" />}
                <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow text-white ${isIn ? 'bg-brand-teal' : 'bg-amber-500'}`}>
                    {isIn ? 'Check-in' : 'Check-out'}
                </span>
                <div className="absolute top-3 right-12 flex gap-1 rounded-xl bg-white/20 backdrop-blur p-0.5">
                    <button type="button" onClick={() => onKind('in')} disabled={!hasIn}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-40 ${isIn ? 'bg-white text-brand-navy' : 'text-white'}`}>IN</button>
                    <button type="button" onClick={() => onKind('out')} disabled={!hasOut}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold disabled:opacity-40 ${!isIn ? 'bg-white text-brand-navy' : 'text-white'}`}>OUT</button>
                </div>
                <button type="button" onClick={onClose} aria-label="Close"
                    className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-white/30">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
                <h2 className="text-lg font-black text-slate-900 tracking-tight font-display">{row.department || 'Staff'}: {isIn ? 'Check-in' : 'Check-out'}</h2>

                <div className="space-y-1.5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Location</div>
                    {point ? (
                        <>
                            <div className="text-sm font-semibold text-slate-800 leading-snug">
                                {address || 'Address not available for this point'}{where ? <span className="text-slate-500 font-medium"> · {where}</span> : null}
                            </div>
                            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500">
                                <span>{at ? format(new Date(at), 'dd/MM/yyyy (h:mm a)') : '—'}</span>
                                <span>{point.lat.toFixed(6)}, {point.lng.toFixed(6)}{point.accuracy_m != null ? ` · ±${point.accuracy_m} m` : ''}</span>
                            </div>
                            <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-brand-navy hover:underline">
                                <MapPin className="w-3.5 h-3.5" /> Open in Google Maps
                            </a>
                        </>
                    ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            No GPS fix was sent with this {isIn ? 'check-in' : 'check-out'}{at ? ` (${format(new Date(at), 'dd/MM/yyyy (h:mm a)')})` : ''}.
                        </div>
                    )}
                </div>

                <div className="space-y-1.5">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Today's trail</div>
                    <div className="flex items-center gap-2 text-[12px] text-slate-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-brand-teal shrink-0" />
                        <span>{fmtClock(row.check_in)} in{row.in ? `, ${placeLabel(row.in) || 'located'}` : ''}</span>
                        <span className="flex-1 border-t-2 border-dashed border-slate-300" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                        <span>{row.check_out ? `${fmtClock(row.check_out)} out${row.out ? `, ${placeLabel(row.out) || 'located'}` : ''}` : 'still in'}</span>
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-2 border-brand-navy overflow-hidden bg-slate-50 flex items-center justify-center font-bold text-brand-navy text-sm shrink-0">
                        {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initialsOf(row.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-base font-bold text-slate-900 truncate">{row.name}</div>
                        <div className="text-xs text-slate-500 truncate">{row.department || 'Staff'} · <span className="font-mono">{row.employee_id}</span></div>
                    </div>
                    <button type="button" onClick={() => navigate(`/admin/attendance/employee/${row.employee_id}`)} aria-label={`Open ${row.name} attendance`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy hover:bg-slate-50 shrink-0">
                        Attendance <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
