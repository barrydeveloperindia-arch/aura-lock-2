import React, { useEffect, useState } from 'react';
import { ScanFace, CalendarDays, MapPin, Camera, Server, ShieldCheck, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';

/**
 * System settings as they really are: read from the live backend and engine.
 * Values that need a deploy or a database change say so instead of pretending
 * to be editable here.
 */
const Row = ({ label, value, mono }) => (
    <div className="flex items-start justify-between gap-6 py-2.5 border-b border-slate-100 last:border-0">
        <span className="text-xs font-semibold text-slate-500 shrink-0">{label}</span>
        <span className={`text-sm text-slate-900 text-right ${mono ? 'font-mono' : 'font-semibold'}`}>{value ?? '—'}</span>
    </div>
);

export default function Settings() {
    const [info, setInfo] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true); setError('');
        try { setInfo(await apiService.getSystemInfo()); }
        catch (err) { setError(err?.response?.data?.error || 'Could not load system information'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const engine = info?.engine || {};
    const cards = [
        {
            icon: ScanFace, title: 'Face engine', tone: engine.status === 'ready' ? 'text-emerald-600 bg-emerald-500/10' : 'text-amber-600 bg-amber-500/10',
            rows: [
                ['Status', engine.status === 'ready' ? `Ready · ${engine.faces} faces enrolled` : (engine.status || 'unreachable')],
                ['Match threshold', engine.threshold != null ? `${engine.threshold} (lower = stricter)` : '—'],
                ['Ambiguity gap', engine.ambiguity_gap != null ? `${engine.ambiguity_gap} · ${info?.ambiguity_frames} consistent frames accept a look-alike` : '—'],
                ['How to change', 'Face Calibration page → measure → set FACE_THRESHOLD / AMBIGUITY_GAP in backend .env and redeploy the engine'],
            ],
        },
        {
            icon: CalendarDays, title: 'Attendance rules', tone: 'text-brand-navy bg-brand-navy/[0.07]',
            rows: [
                ['Late after', info?.late_after || '09:15 IST'],
                ['Weekly off', info?.weekend || 'Sunday'],
                ['Holidays', info?.holidays_count != null ? `${info.holidays_count} entered for ${info.year} (Leaves page)` : 'Leaves page'],
                ['Leave register', info?.leave_register === 'ready' ? 'Ready' : 'Not set up (Supabase schema cache)'],
            ],
        },
        {
            icon: MapPin, title: 'Known places', tone: 'text-brand-navy bg-brand-navy/[0.07]',
            rows: (info?.known_places || []).length
                ? info.known_places.map(p => [p.name, `${p.lat}, ${p.lng} · ${p.radius_m} m`])
                : [['None', 'Add KNOWN_PLACES in backend .env (Name@lat,lng,radius;…)']],
        },
        {
            icon: Camera, title: 'Photos & privacy', tone: 'text-brand-navy bg-brand-navy/[0.07]',
            rows: [
                ['Scan photos kept for', info?.photo_retention_days != null ? `${info.photo_retention_days} days, then deleted nightly` : '—'],
                ['Stored in', 'Private bucket attendance-photos (signed links, 1 hour)'],
                ['GPS on photos', 'Terminal fix at the moment of the scan; consent form required before phone tracking'],
            ],
        },
        {
            icon: Server, title: 'Deployment', tone: 'text-brand-navy bg-brand-navy/[0.07]',
            rows: [
                ['Backend', info?.backend_revision || '—'],
                ['Engine', info?.engine_url ? info.engine_url.replace(/^https?:\/\//, '') : '—'],
                ['Node', info?.node || '—'],
                ['Up since', info?.started_at ? new Date(info.started_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'],
            ],
        },
        {
            icon: ShieldCheck, title: 'Access', tone: 'text-brand-navy bg-brand-navy/[0.07]',
            rows: [
                ['Admin login', info?.admin_email || '—'],
                ['Login guard', `${info?.login_attempts_per_15_min ?? 10} attempts / 15 min per IP, then 5-minute lock`],
                ['Terminal', 'Shared TERMINAL_KEY on /api/attendance/mark'],
                ['Change credentials', 'Edit backend .env (ADMIN_EMAIL / ADMIN_PASSWORD) and redeploy'],
            ],
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 tracking-tighter">Settings</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">Live configuration // what the system is actually running with</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Reload
                </button>
            </div>

            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"><AlertTriangle className="w-4 h-4" />{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {cards.map(c => (
                    <div key={c.title} className="p-5 rounded-2xl bg-white border border-slate-200">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.tone}`}><c.icon className="w-5 h-5" /></div>
                            <h2 className="font-display text-base font-bold text-slate-900">{c.title}</h2>
                        </div>
                        {loading && !info ? <div className="text-xs text-slate-400 py-4">Loading…</div> : c.rows.map(([l, v]) => <Row key={l} label={l} value={v} />)}
                    </div>
                ))}
            </div>
        </div>
    );
}
