import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScanFace, Camera, Loader2, CheckCircle2, XCircle, AlertTriangle, Undo2, RefreshCw, Users, Ruler } from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';

/**
 * Face Calibration ("measure mode").
 *
 * The engine measures how far a live frame is from every enrolled face
 * (0 = identical). Here each measurement is labelled with who really stood in
 * front of the camera, so we can see where our own staff land, where visitors
 * land, and pick the threshold between the two. Nothing measured here is
 * logged as attendance and the door never opens.
 */
const CONDITIONS = [
    { key: 'normal', label: 'Normal' },
    { key: 'glasses', label: 'Glasses' },
    { key: 'angle', label: 'Turned head' },
    { key: 'far', label: 'Far (1.5 m+)' },
    { key: 'low-light', label: 'Low light' },
    { key: 'mask', label: 'Mask / cap' },
];
const VISITOR = '__visitor__';
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fmt = (x, d = 3) => (x == null ? '—' : Number(x).toFixed(d));

export default function FaceCalibration() {
    const [employees, setEmployees] = useState([]);
    const [claimed, setClaimed] = useState(VISITOR);
    const [condition, setCondition] = useState('normal');
    const [session, setSession] = useState(todayIST);
    const [camReady, setCamReady] = useState(false);
    const [camError, setCamError] = useState('');
    const [measuring, setMeasuring] = useState(false);
    const [last, setLast] = useState(null);      // { result, record }
    const [error, setError] = useState('');
    const [data, setData] = useState({ rows: [], report: null, threshold: null });
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // camera
    useEffect(() => {
        let stream;
        let cancelled = false;
        (async () => {
            try {
                if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API not available in this browser');
                stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => {});
                }
                setCamReady(true);
            } catch (err) {
                setCamError(err?.message || 'Could not open the camera');
            }
        })();
        return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
    }, []);

    // employees + existing session rows
    const loadReport = useCallback(async (s) => {
        try { setData(await apiService.getCalibrationReport(s)); setError(''); }
        catch (err) { setError(err?.response?.data?.error || 'Could not load the session report'); }
    }, []);
    useEffect(() => {
        apiService.getUsers().then(list => {
            const arr = Array.isArray(list) ? list : (list?.users || list?.data || []);
            setEmployees(arr.filter(u => u.status === 'Active' && !u.is_deleted).sort((a, b) => String(a.employee_id).localeCompare(String(b.employee_id))));
        }).catch(() => setEmployees([]));
    }, []);
    useEffect(() => { loadReport(session); }, [session, loadReport]);

    const claimedEmp = useMemo(() => employees.find(e => e.employee_id === claimed) || null, [employees, claimed]);

    const captureBlob = () => new Promise((resolve, reject) => {
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c || !v.videoWidth) return reject(new Error('Camera frame not ready yet'));
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not capture frame'))), 'image/jpeg', 0.92);
    });

    const measure = async () => {
        setMeasuring(true); setError('');
        try {
            const blob = await captureBlob();
            const fd = new FormData();
            fd.append('file', blob, 'frame.jpg');
            fd.append('session', session);
            fd.append('condition', condition);
            fd.append('claimed_id', claimed === VISITOR ? '' : claimed);
            fd.append('claimed_name', claimed === VISITOR ? 'Visitor' : (claimedEmp?.name || ''));
            const res = await apiService.measureFace(fd);
            setLast(res);
            setData(d => ({ ...d, rows: res.rows, report: res.report, threshold: res.result?.threshold ?? d.threshold }));
        } catch (err) {
            const msg = err?.response?.data?.error || err?.message || 'Measurement failed';
            setError(msg);
            if (err?.response?.data?.result) setLast({ result: err.response.data.result, record: null });
        } finally { setMeasuring(false); }
    };

    const undo = async () => {
        try { const res = await apiService.undoLastMeasurement(session); setData(d => ({ ...d, rows: res.rows, report: res.report })); setLast(null); }
        catch (err) { setError(err?.response?.data?.error || 'Could not undo'); }
    };

    const report = data.report;
    const threshold = data.threshold ?? report?.current_threshold ?? null;
    const r = last?.result;
    const correct = last?.record && last.record.claimed_id && last.record.matched_id === last.record.claimed_id;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 tracking-tighter">Face Calibration</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">
                        Measure mode // no attendance, no door // threshold now <span className="text-brand-navy">{fmt(threshold, 2)}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600">
                        Session <input value={session} onChange={e => setSession(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40))} aria-label="Session" className="bg-transparent outline-none text-slate-800 font-mono w-32" />
                    </label>
                    <button type="button" onClick={() => loadReport(session)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        <RefreshCw className="w-4 h-4" /> Reload
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* ── Camera + controls ── */}
                <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden">
                    <div className="relative bg-black aspect-[4/3]">
                        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                        <canvas ref={canvasRef} className="hidden" />
                        {!camReady && (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300 text-xs font-semibold px-6 text-center">
                                {camError ? <span className="text-amber-300"><AlertTriangle className="w-5 h-5 inline mr-1" />{camError}</span> : <span><Loader2 className="w-5 h-5 inline mr-1 animate-spin" />Opening camera…</span>}
                            </div>
                        )}
                        {r && (
                            <div className={`absolute top-3 left-3 right-3 px-3 py-2 rounded-xl text-white text-xs font-bold shadow ${!r.face_found ? 'bg-slate-700/90' : (correct ? 'bg-emerald-600/90' : (last.record?.claimed_id ? 'bg-red-600/90' : 'bg-amber-600/90'))}`}>
                                {!r.face_found ? 'No face detected. Try again.' : (
                                    <>
                                        {correct ? <CheckCircle2 className="w-4 h-4 inline mr-1" /> : <XCircle className="w-4 h-4 inline mr-1" />}
                                        Engine says <span className="font-black">{r.best?.name?.trim() || r.best?.employee_id}</span> · distance <span className="font-mono">{fmt(r.best?.distance)}</span>
                                        {r.gap != null && <> · gap <span className="font-mono">{fmt(r.gap)}</span></>}
                                        {' '}· {r.would_pass ? 'would PASS' : 'would FAIL'} at {fmt(r.threshold, 2)}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="p-5 space-y-4">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Who is in front of the camera?</div>
                            <select value={claimed} onChange={e => setClaimed(e.target.value)} aria-label="Person"
                                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-navy">
                                <option value={VISITOR}>Visitor / not enrolled (impostor test)</option>
                                {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.employee_id} · {e.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Condition</div>
                            <div className="flex flex-wrap gap-2">
                                {CONDITIONS.map(c => (
                                    <button key={c.key} type="button" onClick={() => setCondition(c.key)} aria-pressed={condition === c.key}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${condition === c.key ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={measure} disabled={!camReady || measuring}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-navy text-white text-sm font-black hover:bg-brand-navy-light transition-all disabled:opacity-50">
                                {measuring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ruler className="w-4 h-4" />} Measure
                            </button>
                            <button type="button" onClick={undo} disabled={!data.rows?.length} aria-label="Undo last measurement"
                                className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40">
                                <Undo2 className="w-4 h-4" />
                            </button>
                        </div>
                        {error && <div className="flex items-center gap-2 text-xs font-semibold text-red-600"><AlertTriangle className="w-4 h-4" />{error}</div>}
                        <p className="text-[11px] text-slate-500">
                            Plan for a session: each person 5 to 6 scans (normal, glasses, turned head, far, low light), plus 1 or 2 visitors who are not enrolled. Aim for 6 people.
                        </p>
                    </div>
                </div>

                {/* ── Report ── */}
                <div className="lg:col-span-3 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Scans', value: report?.total ?? 0, icon: Camera, tone: 'text-brand-navy bg-brand-navy/[0.07]' },
                            { label: 'Own staff (genuine)', value: report?.genuine?.n ?? 0, icon: Users, tone: 'text-emerald-600 bg-emerald-500/10' },
                            { label: 'Visitors / wrong', value: report?.impostor?.n ?? 0, icon: ScanFace, tone: 'text-amber-600 bg-amber-500/10' },
                            { label: 'Suggested', value: report?.suggestion?.threshold != null ? fmt(report.suggestion.threshold, 2) : '—', icon: Ruler, tone: 'text-brand-navy bg-brand-navy/[0.07]' },
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

                    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Where scans land (distance, lower = more alike)</div>
                            {threshold != null && <div className="text-[11px] font-mono text-slate-500">current threshold {fmt(threshold, 2)}</div>}
                        </div>
                        <Scale genuine={report?.genuine} impostor={report?.impostor} current={threshold} suggested={report?.suggestion?.threshold} />
                        <div className="grid grid-cols-2 gap-4 text-[11px] font-mono text-slate-600">
                            <div><span className="text-emerald-600 font-bold">Own staff</span> min {fmt(report?.genuine?.min)} · mean {fmt(report?.genuine?.mean)} · max {fmt(report?.genuine?.max)}</div>
                            <div><span className="text-amber-600 font-bold">Visitors / wrong</span> min {fmt(report?.impostor?.min)} · mean {fmt(report?.impostor?.mean)}</div>
                        </div>
                        {report?.suggestion && (
                            <div className={`p-3 rounded-xl text-xs ${report.suggestion.threshold == null ? 'bg-slate-50 text-slate-600' : report.suggestion.clean_gap ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                                <span className="font-black">Suggested threshold: {report.suggestion.threshold != null ? fmt(report.suggestion.threshold, 2) : '—'}.</span> {report.suggestion.reason}
                                {threshold != null && report.total > 0 && (
                                    <span className="block mt-1 text-slate-600">At today's {fmt(threshold, 2)}: {report.current_false_accepts} visitor scan(s) would pass, {report.current_false_rejects} own-staff scan(s) would fail.</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">Per person</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                                    <tr><th className="text-left px-4 py-2">Person</th><th className="text-right px-3 py-2">Scans</th><th className="text-right px-3 py-2">Recognised</th><th className="text-right px-3 py-2">Min</th><th className="text-right px-3 py-2">Max</th><th className="text-right px-3 py-2">Pass now</th><th className="text-right px-3 py-2">Pass suggested</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(report?.employees || []).map(e => (
                                        <tr key={e.employee_id} className={e.wrong > 0 ? 'bg-red-50/60' : ''}>
                                            <td className="px-4 py-2 font-semibold text-slate-800">{e.name?.trim() || e.employee_id} <span className="font-mono text-slate-400">{e.employee_id !== 'VISITOR' ? e.employee_id : ''}</span></td>
                                            <td className="px-3 py-2 text-right font-mono">{e.scans}</td>
                                            <td className="px-3 py-2 text-right font-mono">{e.employee_id === 'VISITOR' ? '—' : `${e.correct}/${e.scans}`}{e.wrong > 0 && <span className="text-red-600"> ({e.wrong} wrong)</span>}</td>
                                            <td className="px-3 py-2 text-right font-mono">{fmt(e.min)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{fmt(e.max)}</td>
                                            <td className="px-3 py-2 text-right font-mono">{e.pass_now == null ? '—' : `${e.pass_now}/${e.scans}`}</td>
                                            <td className="px-3 py-2 text-right font-mono">{e.pass_suggested == null ? '—' : `${e.pass_suggested}/${e.scans}`}</td>
                                        </tr>
                                    ))}
                                    {!(report?.employees || []).length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400 font-semibold">No measurements in this session yet.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">Last measurements</div>
                        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                            {[...(data.rows || [])].reverse().slice(0, 30).map((row, i) => (
                                <div key={`${row.at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                                    <div className="min-w-0">
                                        <span className="font-semibold text-slate-800">{row.claimed_name || row.claimed_id || 'Visitor'}</span>
                                        <span className="text-slate-400"> · {row.condition}</span>
                                        <span className="text-slate-400 font-mono"> · {row.at ? format(new Date(row.at), 'HH:mm:ss') : ''}</span>
                                    </div>
                                    <div className="font-mono text-right shrink-0">
                                        {row.face_found === false ? <span className="text-slate-400">no face</span> : (
                                            <>
                                                <span className={row.claimed_id && row.matched_id !== row.claimed_id ? 'text-red-600 font-bold' : 'text-slate-700'}>{row.matched_name?.trim() || row.matched_id}</span>
                                                <span className="text-slate-500"> {fmt(row.distance)}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {!(data.rows || []).length && <div className="px-4 py-6 text-center text-slate-400 text-xs font-semibold">Nothing measured yet.</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** A 0.2 → 1.0 ruler with the genuine range, the impostor range, and the two thresholds. */
function Scale({ genuine, impostor, current, suggested }) {
    const lo = 0.2, hi = 1.0;
    const x = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
    const band = (s, cls, label) => (s && s.n > 0 ? <div className={`absolute top-3 h-4 rounded ${cls}`} style={{ left: x(s.min), width: `calc(${x(s.max)} - ${x(s.min)})`, minWidth: 6 }} title={`${label} ${s.min} – ${s.max}`} /> : null);
    const mark = (v, cls, label) => (v == null ? null : <div className={`absolute top-0 h-10 w-0.5 ${cls}`} style={{ left: x(v) }} title={`${label} ${v}`} />);
    return (
        <div className="relative h-14">
            <div className="absolute top-3 left-0 right-0 h-4 rounded bg-slate-100" />
            {band(genuine, 'bg-emerald-400/70', 'own staff')}
            {band(impostor, 'bg-amber-400/70', 'visitors')}
            {mark(current, 'bg-slate-700', 'current')}
            {mark(suggested, 'bg-brand-navy', 'suggested')}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] font-mono text-slate-400">
                {[0.2, 0.4, 0.6, 0.8, 1.0].map(v => <span key={v}>{v.toFixed(1)}</span>)}
            </div>
        </div>
    );
}
