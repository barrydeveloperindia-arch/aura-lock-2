import React, { useCallback, useEffect, useState } from 'react';
import { UserX, Loader2, Send, CheckCircle2, AlertTriangle, MailX } from 'lucide-react';
import { apiService } from '../services/api';

const yesterdayIso = () => {
    const d = new Date(Date.now() + 5.5 * 3600 * 1000 - 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
};

// Englabs staff absent without approved leave. Nothing is sent by itself: the admin reviews the
// list and sends each notice.
export default function AbsenceNoticesCard() {
    const [date, setDate] = useState(yesterdayIso);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [err, setErr] = useState('');
    const [sentNow, setSentNow] = useState({});

    const load = useCallback(async () => {
        setLoading(true); setErr('');
        try { setData(await apiService.getAbsenceNotices(date)); }
        catch (e) { setErr(e.response?.data?.error || e.message || 'Could not load the list.'); setData(null); }
        finally { setLoading(false); }
    }, [date]);
    useEffect(() => { load(); }, [load]);

    const send = async (n) => {
        if (!window.confirm(`Email a Rs. ${data?.fineInr} absence notice to ${n.name} (${n.email}) for ${date}?\n\nThis cannot be undone.`)) return;
        setBusy(n.employee_id); setErr('');
        try { await apiService.sendAbsenceNotice(n.employee_id, date); setSentNow(s => ({ ...s, [n.employee_id]: true })); }
        catch (e) { setErr(e.response?.data?.error || e.message || 'Could not send the notice.'); }
        finally { setBusy(''); }
    };

    const notices = data?.notices || [];
    return (
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm lg:col-span-2">
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-navy bg-brand-navy/[0.07]"><UserX className="w-5 h-5" /></div>
                <div className="flex-1 min-w-[220px]">
                    <h2 className="font-display text-base font-bold text-slate-900">Absence without approved leave</h2>
                    <p className="text-sm text-slate-500">Englabs staff only. Review the list, then send each notice yourself. Nothing is sent automatically.</p>
                </div>
                <label className="text-sm text-slate-600 flex items-center gap-2">
                    Day
                    <input type="date" value={date} max={yesterdayIso()} onChange={e => setDate(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-blue-500" />
                </label>
            </div>

            {err && <div className="mb-3 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium"><AlertTriangle className="w-4 h-4 shrink-0" />{err}</div>}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
            ) : data?.skip ? (
                <p className="text-sm text-slate-600 py-2">No notices for this day: {data.reason}.</p>
            ) : notices.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-600 py-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nobody was absent without approved leave on this day.</p>
            ) : (
                <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {notices.map(n => {
                        const done = n.alreadySent || sentNow[n.employee_id];
                        return (
                            <li key={n.employee_id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                                <div className="flex-1 min-w-[200px]">
                                    <div className="text-sm font-semibold text-slate-900">{n.name} <span className="font-mono text-xs font-normal text-slate-500">{n.employee_id}</span></div>
                                    <div className="text-xs text-slate-500">{n.department} &middot; {n.reason}</div>
                                </div>
                                {done ? (
                                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Notice sent</span>
                                ) : n.emailable ? (
                                    <button onClick={() => send(n)} disabled={busy === n.employee_id}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm disabled:opacity-50">
                                        {busy === n.employee_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send notice
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-sm text-slate-500"><MailX className="w-4 h-4" /> No email on record, tell in person</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            {(data?.pendingLeave || []).length > 0 && (
                <p className="mt-3 text-sm text-slate-600">
                    <span className="font-semibold text-slate-900">Held back (leave not decided yet): </span>
                    {data.pendingLeave.map(p => p.name).join(', ')}. Approve or reject their leave on the Leaves page first.
                </p>
            )}
            <p className="mt-3 text-xs text-slate-500">Fine per notice: Rs. {data?.fineInr ?? 500}. The notice tells the staff member to contact the office if the record is wrong.</p>
        </div>
    );
}
