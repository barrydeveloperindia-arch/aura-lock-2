import React, { useEffect, useState } from 'react';
import { BellRing, Loader2, Send, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiService } from '../services/api';

// Daily attendance email: status, recipients, a dry-run preview and a "send now" test.
export default function AlertsCard() {
    const [cfg, setCfg] = useState(null);
    const [busy, setBusy] = useState('');
    const [result, setResult] = useState(null);
    const [err, setErr] = useState('');

    useEffect(() => {
        apiService.getAlertConfig().then(setCfg).catch(() => setErr('Could not load alert settings.'));
    }, []);

    const run = async (dry) => {
        if (!dry && !window.confirm(`Send today's attendance email to ${cfg?.email?.recipients?.length || 0} recipient(s) now?`)) return;
        setBusy(dry ? 'preview' : 'send'); setErr(''); setResult(null);
        try { setResult(await apiService.runDailyAlert({ dry })); }
        catch (e) { setErr(e.response?.data?.error || e.message || 'Request failed.'); }
        finally { setBusy(''); }
    };

    const configured = Boolean(cfg?.email?.configured);
    return (
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-brand-navy bg-brand-navy/[0.07]"><BellRing className="w-5 h-5" /></div>
                <div className="flex-1">
                    <h2 className="font-display text-base font-bold text-slate-900">Daily attendance email</h2>
                    <p className="text-sm text-slate-500">{cfg?.schedule || 'Late and not-in-yet list, sent automatically each morning.'}</p>
                </div>
                {cfg && (
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${configured ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                        {configured ? 'Configured' : 'Not configured'}
                    </span>
                )}
            </div>

            <div className="text-sm text-slate-700 mb-4">
                <span className="font-semibold text-slate-900">Recipients: </span>
                {cfg?.email?.recipients?.length ? cfg.email.recipients.join(', ') : 'none yet'}
                {!configured && cfg && <p className="text-slate-500 mt-1">Add ALERT_SMTP_USER, ALERT_SMTP_PASS and ALERT_EMAIL_TO to backend .env and redeploy.</p>}
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={() => run(true)} disabled={!!busy}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
                    {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} Preview today
                </button>
                <button onClick={() => run(false)} disabled={!!busy || !configured}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm disabled:opacity-50">
                    {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send now
                </button>
            </div>

            {err && <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium"><AlertTriangle className="w-4 h-4 shrink-0" />{err}</div>}
            {result && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        {result.skipped ? `Skipped: ${result.skipped}` : result.sent ? `Sent to ${result.recipients} recipient(s)` : 'Preview (nothing sent)'}
                    </div>
                    {Array.isArray(result.personal) && (
                        <p className="text-sm text-slate-700 mb-2">
                            <span className="font-semibold text-slate-900">Personal late emails: </span>
                            {result.personal.length ? result.personal.map(p => `${p.name} <${p.email}>`).join(', ') : 'none (nobody late, or their email updates are off)'}
                        </p>
                    )}
                    {result.personal && !Array.isArray(result.personal) && (
                        <p className="text-sm text-slate-700 mb-2">Personal late emails sent: {result.personal.sent}{result.personal.failed?.length ? `, failed: ${result.personal.failed.join(', ')}` : ''}</p>
                    )}
                    {result.text && <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono max-h-72 overflow-y-auto">{result.text}</pre>}
                </div>
            )}
        </div>
    );
}
