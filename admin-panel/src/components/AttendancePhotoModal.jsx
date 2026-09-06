import React, { useEffect, useState } from 'react';
import { X, Camera, Loader2, AlertTriangle, LogIn, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';

/**
 * Viewer for the frame captured at check-in / check-out.
 * The date/time overlay comes from the attendance row (server clock), not
 * from pixels burned into the image, so the original frame stays untouched.
 *
 * Props:
 *  record  attendance row ({ id, date, check_in, check_out, employees, photos })
 *  kind    'in' | 'out'
 *  onClose ()
 *
 * Parent must pass key={`${record.id}-${kind}`} so switching rows re-initialises state.
 */
export default function AttendancePhotoModal({ record, kind: initialKind, onClose }) {
    const [kind, setKind] = useState(initialKind);
    // Result of the last completed fetch, tagged with the request it answers.
    // "loading" is derived: the tag does not match the current request yet.
    const [fetched, setFetched] = useState({ tag: null, error: null, photo: null });
    const requestTag = record?.id ? `${record.id}/${kind}` : null;

    useEffect(() => {
        if (!requestTag) return;
        let cancelled = false;
        const [id, k] = requestTag.split('/');
        apiService.getAttendancePhoto(id, k)
            .then((photo) => { if (!cancelled) setFetched({ tag: requestTag, error: null, photo }); })
            .catch((err) => {
                if (cancelled) return;
                const msg = err?.response?.status === 404
                    ? 'No photo was stored for this event.'
                    : (err?.response?.data?.error || 'Could not load photo.');
                setFetched({ tag: requestTag, error: msg, photo: null });
            });
        return () => { cancelled = true; };
    }, [requestTag]);

    const state = fetched.tag === requestTag
        ? { loading: false, error: fetched.error, photo: fetched.photo }
        : { loading: true, error: null, photo: null };

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft' && record?.photos?.in) setKind('in');
            if (e.key === 'ArrowRight' && record?.photos?.out) setKind('out');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, record]);

    if (!record) return null;

    const name = record.employees?.name || 'Employee';
    const empId = record.employees?.employee_id || '';
    const capturedAt = kind === 'in' ? record.check_in : record.check_out;
    const hasIn = !!record.photos?.in;
    const hasOut = !!record.photos?.out;
    const isIn = kind === 'in';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`${isIn ? 'Check-in' : 'Check-out'} photo of ${name}`}
        >
            <div
                className="relative w-full max-w-2xl rounded-3xl bg-white border border-slate-200 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                            <Camera className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">{name}</div>
                            <div className="text-[10px] font-mono text-slate-500 truncate">{empId}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex rounded-xl bg-slate-50 border border-slate-200 p-0.5">
                            <button
                                type="button"
                                onClick={() => setKind('in')}
                                disabled={!hasIn}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                                    ${isIn ? 'bg-emerald-500/15 text-emerald-700' : 'text-slate-500 hover:text-slate-900'}
                                    disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                                <LogIn className="w-3.5 h-3.5" /> IN
                            </button>
                            <button
                                type="button"
                                onClick={() => setKind('out')}
                                disabled={!hasOut}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                                    ${!isIn ? 'bg-amber-500/15 text-amber-700' : 'text-slate-500 hover:text-slate-900'}
                                    disabled:opacity-30 disabled:cursor-not-allowed`}
                            >
                                <LogOut className="w-3.5 h-3.5" /> OUT
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Image area */}
                <div className="relative bg-black aspect-[4/3] flex items-center justify-center">
                    {state.loading && (
                        <div className="flex flex-col items-center gap-3 text-slate-300">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs font-semibold">Loading photo…</span>
                        </div>
                    )}
                    {!state.loading && state.error && (
                        <div className="flex flex-col items-center gap-3 text-slate-300 px-6 text-center">
                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                            <span className="text-xs font-semibold">{state.error}</span>
                        </div>
                    )}
                    {!state.loading && state.photo && (
                        <>
                            <img
                                src={state.photo.url}
                                alt={`${name} ${isIn ? 'check-in' : 'check-out'}`}
                                className="w-full h-full object-contain"
                            />
                            {/* Name / IN-OUT / date-time are stamped into the image by the server.
                                Show the DB-recorded time as a small badge at the top so it never covers the stamp. */}
                            <div className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow
                                ${isIn ? 'bg-emerald-500/90 text-white' : 'bg-amber-500/90 text-white'}`}>
                                {isIn ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                                {isIn ? 'Check In' : 'Check Out'}
                                <span className="font-mono normal-case tracking-normal">
                                    {capturedAt ? format(new Date(capturedAt), 'dd MMM yyyy, HH:mm:ss') : (record.date || '')}
                                </span>
                            </div>
                        </>
                    )}

                    {/* Prev / next between IN and OUT */}
                    {hasIn && hasOut && (
                        <>
                            <button
                                type="button"
                                onClick={() => setKind('in')}
                                disabled={isIn}
                                aria-label="Show check-in photo"
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white disabled:opacity-20"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setKind('out')}
                                disabled={!isIn}
                                aria-label="Show check-out photo"
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-white disabled:opacity-20"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>

                {state.photo?.location && (
                    <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-4 bg-slate-50">
                        <div className="text-[11px] text-slate-700 min-w-0">
                            <span className="font-black uppercase tracking-widest text-[10px] text-slate-500 mr-2">Location</span>
                            <span className="font-mono">{state.photo.location.lat.toFixed(5)}, {state.photo.location.lng.toFixed(5)}</span>
                            {state.photo.location.accuracy_m != null && (
                                <span className="text-slate-500"> · ±{state.photo.location.accuracy_m} m</span>
                            )}
                            <span className="text-slate-400"> · {state.photo.location_source === 'terminal' ? 'terminal tablet GPS' : state.photo.location_source}</span>
                        </div>
                        <a
                            href={`https://www.google.com/maps?q=${state.photo.location.lat},${state.photo.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[11px] font-bold text-emerald-700 hover:underline"
                        >
                            Open in Google Maps ↗
                        </a>
                    </div>
                )}
                <div className="px-5 py-3 text-[10px] text-slate-500 border-t border-slate-200 flex items-center justify-between gap-4">
                    <span>Captured by the terminal at the moment of verification. Name, time and location are stamped by the server.</span>
                    {state.photo?.expires_at && (
                        <span className="font-mono shrink-0">link valid until {format(new Date(state.photo.expires_at), 'HH:mm')}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
