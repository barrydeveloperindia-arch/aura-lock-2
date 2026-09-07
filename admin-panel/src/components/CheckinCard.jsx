import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, LogIn, LogOut, MapPin, ExternalLink, Camera, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

import { apiService } from '../services/api';

/**
 * One check-in / check-out event as a card: the frame the terminal captured,
 * the street address (reverse-geocoded from the terminal GPS), the exact time,
 * the coordinates and the person. Used by the Live Map when a staff member is
 * selected.
 *
 * Props: row (a Live Map row), kind 'in' | 'out', onKind(kind), avatarUrl, onBack
 */
export default function CheckinCard({ row, kind, onKind, avatarUrl, onBack }) {
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
    // the freshest address: the photo endpoint (just geocoded) beats the list snapshot
    const address = photo?.address || point?.address || null;
    const hasIn = !!row.check_in, hasOut = !!row.check_out;
    const initials = (row.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-brand-navy">
                    <ArrowLeft className="w-3.5 h-3.5" /> All staff
                </button>
                <div className="flex rounded-xl bg-slate-50 border border-slate-200 p-0.5">
                    <button type="button" onClick={() => onKind('in')} disabled={!hasIn}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 ${isIn ? 'bg-emerald-500/15 text-emerald-700' : 'text-slate-500 hover:text-slate-900'}`}>
                        <LogIn className="w-3.5 h-3.5" /> IN
                    </button>
                    <button type="button" onClick={() => onKind('out')} disabled={!hasOut}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 ${!isIn ? 'bg-amber-500/15 text-amber-700' : 'text-slate-500 hover:text-slate-900'}`}>
                        <LogOut className="w-3.5 h-3.5" /> OUT
                    </button>
                </div>
            </div>

            <div className="overflow-y-auto">
                {/* Photo */}
                <div className="relative bg-slate-900 aspect-[4/3] flex items-center justify-center">
                    {loading && <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />}
                    {!loading && fetched.error && (
                        <div className="flex flex-col items-center gap-2 text-slate-300 px-6 text-center">
                            <Camera className="w-6 h-6" /><span className="text-xs font-semibold">{fetched.error}</span>
                        </div>
                    )}
                    {photo?.url && <img src={photo.url} alt={`${row.name} ${isIn ? 'check-in' : 'check-out'}`} className="w-full h-full object-cover" />}
                    <div className={`absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow ${isIn ? 'bg-emerald-500/90' : 'bg-amber-500/90'} text-white`}>
                        {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}{isIn ? 'Check-in' : 'Check-out'}
                    </div>
                </div>

                <div className="p-5 space-y-5">
                    <div>
                        <h2 className="text-lg font-black text-slate-900 tracking-tight">{row.department || 'Staff'}: {isIn ? 'Check-in' : 'Check-out'}</h2>
                    </div>

                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Location</div>
                        {point ? (
                            <>
                                <div className="text-sm font-semibold text-slate-800 leading-snug">{address || 'Address not available for this point'}</div>
                                <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[11px] font-mono text-slate-500">
                                    <span>{at ? format(new Date(at), 'dd/MM/yyyy (h:mm a)') : '—'}</span>
                                    <span>{point.lat.toFixed(10).replace(/0+$/, '')}, {point.lng.toFixed(10).replace(/0+$/, '')}{point.accuracy_m != null ? ` · ±${point.accuracy_m} m` : ''}</span>
                                </div>
                                <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-navy hover:underline">
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

                    <div className="pt-4 border-t border-slate-200 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 border-rose-400 overflow-hidden bg-slate-50 flex items-center justify-center font-bold text-brand-navy text-sm shrink-0">
                            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="text-base font-bold text-slate-900 truncate">{row.name}</div>
                            <div className="text-xs text-slate-500 truncate">{row.department || 'Staff'} · <span className="font-mono">{row.employee_id}</span></div>
                        </div>
                        <button type="button" onClick={() => navigate(`/admin/attendance/employee/${row.employee_id}`)} aria-label={`Open ${row.name} attendance`}
                            className="w-9 h-9 rounded-xl border border-slate-200 text-slate-400 hover:text-brand-navy hover:bg-slate-50 flex items-center justify-center shrink-0">
                            <ExternalLink className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
