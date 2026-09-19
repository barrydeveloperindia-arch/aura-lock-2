import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarOff, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Sun, Wallet, Share2, Eye, X, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import useAvatars from '../hooks/useAvatars';

const STATUS_TONE = { Pending: 'bg-amber-500/10 text-amber-700', Approved: 'bg-emerald-500/10 text-emerald-700', Rejected: 'bg-rose-500/10 text-rose-700' };
// A group is several rows approved/rejected together, so any Rejected row makes the whole
// group Rejected; otherwise it's Approved only once every row is, else still Pending —
// matches the "Admin / Supervisor Approval: Approved / Rejected" box on the printed form.
const groupStatus = (group) => (group.some(l => l.status === 'Rejected') ? 'Rejected' : group.every(l => l.status === 'Approved') ? 'Approved' : 'Pending');

// "Who is approving/rejecting?" — the printed form's "Admin / Supervisor Approval ...
// Signature" line, kept as a fixed pick list rather than free text. More than one person
// can sign the same leave (e.g. Bharat sir and Salil sir together), so this is a checklist,
// not a single pick — parent remounts this with a fresh key each time it opens, so the
// checked state always starts empty for a new decision.
function ApproverModal({ decision, approvers, types, onPick, onClose }) {
    const [picked, setPicked] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    if (!decision) return null;
    const { group, status } = decision;
    const first = group[0];
    const toggle = (name) => setPicked(p => (p.includes(name) ? p.filter(n => n !== name) : [...p, name]));
    // onPick is the network call itself (throws on failure) — caught HERE so the reason shows
    // inside this modal, not on a page-level banner the modal's own backdrop is hiding.
    const confirm = async () => {
        setSubmitting(true); setSubmitError('');
        try { await onPick(picked); }
        catch (err) { setSubmitError(err?.response?.data?.error || `Could not ${status === 'Approved' ? 'approve' : 'reject'} — try again.`); }
        finally { setSubmitting(false); }
    };
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center px-4" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100">
                    <div className="text-xs font-bold text-slate-600 mb-1">
                        {status === 'Approved' ? 'Approve' : 'Reject'} leave — who is signing?
                    </div>
                    <div className="text-sm font-bold text-slate-900">{first.employee?.name} · {types[first.type] || first.type}</div>
                    <div className="text-xs text-slate-600 mt-1">Tick everyone who is signing — more than one is fine.</div>
                </div>
                <div className="p-3 grid grid-cols-1 gap-1">
                    {approvers.map(name => (
                        <label key={name} className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)}
                                className={`w-4 h-4 rounded ${status === 'Approved' ? 'accent-emerald-600' : 'accent-rose-600'}`} />
                            <span className={`text-sm font-semibold ${status === 'Approved' ? 'text-emerald-700' : 'text-rose-700'}`}>{name}</span>
                        </label>
                    ))}
                </div>
                {submitError && (
                    <div className="mx-3 mb-2 flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{submitError}
                    </div>
                )}
                <div className="p-3 pt-1 flex items-center gap-2">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                    <button type="button" disabled={picked.length === 0 || submitting} onClick={confirm}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 ${status === 'Approved' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}>
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {status === 'Approved' ? 'Approve' : 'Reject'}{picked.length > 1 ? ` (${picked.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Light-themed modal (the rest of this page is light; the dark shell in Users.jsx doesn't fit here).
function ViewModal({ group, types, avatar, onShare, onDecide, onDelete, onClose }) {
    if (!group) return null;
    const first = group[0];
    const status = groupStatus(group);
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={onClose}>
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full border-2 border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center font-bold text-sm text-brand-navy shrink-0">
                            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : initials(first.employee?.name)}
                        </div>
                        <div className="min-w-0">
                            <div className="text-base font-bold text-slate-900 truncate">{first.employee?.name}</div>
                            <div className="text-xs text-slate-500 truncate">{first.employee?.department} · <span className="font-mono">{first.employee?.employee_id}</span></div>
                        </div>
                    </div>
                    <button type="button" aria-label="Close" onClick={onClose} className="w-8 h-8 rounded-lg text-slate-600 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${TYPE_TONE[first.type] || 'bg-slate-100 text-slate-600'}`}>{first.type}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_TONE[status]}`}>{status}</span>
                        <span className="text-sm font-semibold text-slate-700">{types[first.type] || first.type}</span>
                        <span className="text-sm text-slate-600">· {group.length} day{group.length > 1 ? 's' : ''}</span>
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-600 mb-2">Dates</div>
                        <div className="flex flex-wrap gap-1.5">
                            {group.map(l => (
                                <span key={l.id} className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700">
                                    {format(new Date(l.date + 'T00:00:00'), 'EEE dd MMM')}
                                </span>
                            ))}
                        </div>
                    </div>
                    {first.note && (
                        <div>
                            <div className="text-xs font-bold text-slate-600 mb-1">Reason for requested leave</div>
                            <div className="text-sm text-slate-700">{first.note}</div>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                        <UserIcon className="w-3.5 h-3.5" />
                        Added by {first.created_by || 'admin'}{first.created_at ? ` · ${format(new Date(first.created_at), 'dd MMM, HH:mm')}` : ''}
                    </div>
                    {status !== 'Pending' && first.approved_by?.length > 0 && (
                        <div className={`text-xs font-semibold ${status === 'Approved' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {status} by {first.approved_by.join(', ')}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 p-5 pt-0 flex-wrap">
                    {status === 'Pending' && (
                        <>
                            <button type="button" onClick={() => onDecide('Approved')} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500"><CheckCircle2 className="w-4 h-4" /> Approve</button>
                            <button type="button" onClick={() => onDecide('Rejected')} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-bold hover:bg-rose-100"><XCircle className="w-4 h-4" /> Reject</button>
                        </>
                    )}
                    <button type="button" onClick={onShare} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-bold hover:bg-brand-navy-light"><Share2 className="w-4 h-4" /> Share</button>
                    <button type="button" onClick={onDelete} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-bold hover:bg-red-100"><Trash2 className="w-4 h-4" /> Delete</button>
                </div>
            </div>
        </div>
    );
}

/**
 * Leave register: who is on CL / SL / EL / UWL / Other on which day, plus the company
 * holiday list — matching the printed Leave Application Form (Sick, Casual, Emergency,
 * Urgent Work, Other leave; Admin/Supervisor Approval: Approved / Rejected). Both feed the
 * monthly report (absent = working days − present − leave) and the daily Attendance absent list.
 *
 * A leave can span several days (e.g. going home for a wedding): the admin
 * picks a From/To range and every WORKING day in it is marked in one call —
 * Sundays and company holidays inside the range are skipped automatically,
 * the same rule the monthly report already uses to count absence.
 */
const TYPE_TONE = {
    CL: 'bg-brand-navy/10 text-brand-navy', SL: 'bg-rose-500/10 text-rose-600', EL: 'bg-orange-500/10 text-orange-700',
    UWL: 'bg-violet-500/10 text-violet-700', OTH: 'bg-slate-500/10 text-slate-600',
};
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Leaves() {
    const [month, setMonth] = useState(() => new Date());
    const [types, setTypes] = useState({ CL: 'Casual leave', SL: 'Sick leave', EL: 'Emergency leave', UWL: 'Urgent work leave', OTH: 'Other' });
    const [employees, setEmployees] = useState([]);
    const [leaves, setLeaves] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [clRows, setClRows] = useState([]); // this month's per-employee CL from the monthly report — one source of truth, not re-derived here
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState(null); // { text } after a successful multi-day save
    const [setupNeeded, setSetupNeeded] = useState(false);
    const [form, setForm] = useState({ employee_id: '', from: todayISO(), to: todayISO(), type: 'CL', note: '' });
    const [holForm, setHolForm] = useState({ date: '', name: '' });
    const [saving, setSaving] = useState(false);
    const [viewGroup, setViewGroup] = useState(null);
    const [approvers, setApprovers] = useState(['Admin', 'Bharat sir', 'Salil sir', 'Shreya mam']);
    const [decision, setDecision] = useState(null); // { group, status } while picking who is signing

    const from = `${monthKey(month)}-01`;
    const to = format(new Date(month.getFullYear(), month.getMonth() + 1, 0), 'yyyy-MM-dd');
    const avatars = useAvatars(leaves.map(l => l.employee?.employee_id));

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const [l, h] = await Promise.all([apiService.getLeaves(from, to), apiService.getHolidays(month.getFullYear())]);
            setLeaves(l.leaves || []); setHolidays(h.holidays || []); setSetupNeeded(false);
        } catch (err) {
            if (err?.response?.status === 503) setSetupNeeded(true);
            else setError(err?.response?.data?.error || 'Could not load leaves');
        } finally { setLoading(false); }
        // CL balance doesn't need the leave tables to exist (it falls back to the imported
        // ledger), so it's fetched separately and never blocks the rest of the page.
        apiService.getMonthlyReport(month.getMonth() + 1, month.getFullYear())
            .then(r => setClRows(r?.data || []))
            .catch(() => setClRows([]));
    }, [from, to, month]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        apiService.getUsers().then(list => {
            const arr = Array.isArray(list) ? list : (list?.users || []);
            setEmployees(arr.filter(u => u.status === 'Active' && !u.is_deleted).sort((a, b) => a.name.localeCompare(b.name)));
        }).catch(() => {});
        apiService.getLeaveTypes().then(d => { if (d?.types) setTypes(d.types); }).catch(() => {});
        apiService.getLeaveApprovers().then(d => { if (d?.approvers?.length) setApprovers(d.approvers); }).catch(() => {});
    }, []);

    const clByEmployeeId = useMemo(() => new Map(clRows.map(r => [r.employee_id, r])), [clRows]);

    const addLeave = async (e) => {
        e.preventDefault();
        if (!form.employee_id) { setError('Choose a staff member.'); return; }
        if (form.to < form.from) { setError('"To" date must be on or after "From".'); return; }
        setSaving(true); setError(''); setNotice(null);
        try {
            const res = await apiService.addLeaveRange({ employee_id: form.employee_id, from: form.from, to: form.to, type: form.type, note: form.note });
            const who = employees.find(e => e.employee_id === form.employee_id)?.name || form.employee_id;
            const days = res.created === 1 ? '1 day' : `${res.created} days`;
            const skipText = res.skipped?.length ? ` (skipped ${res.skipped.map(s => format(new Date(s.date + 'T00:00:00'), 'd MMM')).join(', ')} — ${res.skipped[0].reason.includes('Sunday') ? 'Sunday' : 'holiday'})` : '';
            setNotice({ text: `Marked ${form.type} for ${who}: ${days}${skipText}.` });
            setForm(f => ({ ...f, note: '' }));
            await load();
        } catch (err) { setError(err?.response?.data?.error || 'Could not save leave'); }
        finally { setSaving(false); }
    };
    // A multi-day leave is several rows in the DB (one per working day, so absence maths
    // stays correct) but reads as ONE trip: same person + same type + same note, no more than
    // a 2-day gap between them (covers one skipped Sunday or holiday). Group them for display,
    // and delete/share the whole group as a unit.
    const removeGroup = async (group) => {
        try { await Promise.all(group.map(l => apiService.deleteLeave(l.id))); setLeaves(ls => ls.filter(l => !group.some(g => g.id === l.id))); setViewGroup(null); }
        catch (err) { setError(err?.response?.data?.error || 'Could not delete'); }
    };
    // Throws on failure — ApproverModal awaits this itself and shows the reason inline (its own
    // backdrop hides the page-level error banner, so a silent catch here looked like a dead
    // button). Only clears viewGroup/decision once the API call has actually succeeded.
    const setGroupStatus = async (group, status, approvedBy) => {
        await Promise.all(group.map(l => apiService.setLeaveStatus(l.id, status, approvedBy)));
        setLeaves(ls => ls.map(l => (group.some(g => g.id === l.id) ? { ...l, status, approved_by: approvedBy || l.approved_by } : l)));
        setViewGroup(null);
        setDecision(null);
    };
    // Approve/Reject always asks who is signing first (the printed form's "Admin / Supervisor
    // Approval ... Signature" line) — a bare click never changes status on its own.
    const askDecision = (group, status) => setDecision({ group, status });
    // Follows the printed Leave Application Form's own field order and labels
    // (G:\Englabs Office Record\...\13_LEAVE APPLICATION FORM) so the WhatsApp message reads
    // like the paper form. Designation isn't on the field's own line here — the attendance
    // system has no "designation" field for staff, so it's left off rather than guessed.
    const shareText = (group) => {
        const first = group[0], last = group[group.length - 1];
        const fromLabel = format(new Date(first.date + 'T00:00:00'), 'dd MMM yyyy');
        const toLabel = format(new Date(last.date + 'T00:00:00'), 'dd MMM yyyy');
        const lines = [
            '*ENGLABS INDIA PVT. LTD. — Leave Application*',
            '',
            `Employee Name: ${first.employee?.name || ''} (${first.employee?.employee_id || ''})`,
            `Department: ${first.employee?.department || ''}`,
            `Date: ${format(first.created_at ? new Date(first.created_at) : new Date(), 'dd MMM yyyy')}`,
            '',
            `Leave Type: ${types[first.type] || first.type}`,
            `Dates Requested: Leave From ${fromLabel} To ${toLabel} (${group.length} day${group.length > 1 ? 's' : ''})`,
            `Reason for requested leave: ${first.note || '—'}`,
        ];
        // "Pending"/"Approved" already count against the CL balance, so the balance the app
        // shows right now is the AFTER value; add back this leave's days to get the BEFORE one.
        if (first.type === 'CL') {
            const cl = clByEmployeeId.get(first.employee?.employee_id);
            if (cl?.cl_balance != null) lines.push(`CL balance: ${cl.cl_balance + group.length} → ${cl.cl_balance}`);
        }
        const status = groupStatus(group);
        lines.push('', 'Admin / Supervisor Approval:');
        if (status === 'Pending') lines.push('Current status: On hold', 'Sir/Mam, please confirm — Approved, Rejected, or on Hold? 🙏');
        else lines.push(`${status} by ${first.approved_by?.length ? first.approved_by.join(', ') : '—'}`);
        return lines.join('\n');
    };
    const share = async (text) => {
        if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelled — fall through to WhatsApp */ } }
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    };
    const addHoliday = async (e) => {
        e.preventDefault();
        if (!holForm.date || !holForm.name.trim()) return;
        setSaving(true); setError('');
        try { await apiService.addHoliday(holForm); setHolForm({ date: '', name: '' }); await load(); }
        catch (err) { setError(err?.response?.data?.error || 'Could not save holiday'); }
        finally { setSaving(false); }
    };
    const removeHoliday = async (date) => {
        try { await apiService.deleteHoliday(date); setHolidays(hs => hs.filter(h => h.date !== date)); }
        catch (err) { setError(err?.response?.data?.error || 'Could not delete'); }
    };

    const counts = useMemo(() => { const c = {}; for (const l of leaves) c[l.type] = (c[l.type] || 0) + 1; return c; }, [leaves]);
    const leaveGroups = useMemo(() => {
        const byKey = new Map();
        for (const l of leaves) {
            const key = `${l.employee?.employee_id || l.employee_id}|${l.type}|${l.note || ''}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(l);
        }
        const groups = [];
        for (const rows of byKey.values()) {
            const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
            let run = [sorted[0]];
            for (let i = 1; i < sorted.length; i++) {
                const gapDays = Math.round((new Date(sorted[i].date + 'T00:00:00') - new Date(run[run.length - 1].date + 'T00:00:00')) / 86400000);
                if (gapDays <= 2) run.push(sorted[i]);
                else { groups.push(run); run = [sorted[i]]; }
            }
            groups.push(run);
        }
        return groups.sort((a, b) => b[b.length - 1].date.localeCompare(a[a.length - 1].date));
    }, [leaves]);
    const monthHolidays = holidays.filter(h => h.date >= from && h.date <= to);
    const dayCount = (() => {
        if (!form.from || !form.to || form.to < form.from) return 0;
        return Math.round((new Date(form.to + 'T00:00:00') - new Date(form.from + 'T00:00:00')) / 86400000) + 1;
    })();
    const selectedCl = form.employee_id ? clByEmployeeId.get(form.employee_id) : null;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2 tracking-tight">Leaves &amp; Holidays</h1>
                    <p className="text-slate-500 text-xs md:text-sm font-medium">
                        Leave register // <span className="text-brand-navy">{leaves.length}</span> leave days this month · {monthHolidays.length} holidays
                    </p>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                    <button type="button" aria-label="Previous month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="font-display font-bold text-slate-900 text-sm w-32 text-center">{format(month, 'MMMM yyyy')}</span>
                    <button type="button" aria-label="Next month" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
                </div>
            </div>

            {setupNeeded && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div><b>Leave register is not set up yet.</b> Run <code className="font-mono">supabase/migration_v8_leaves.sql</code> once in the Supabase SQL editor, then reload this page.</div>
                </div>
            )}
            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"><AlertTriangle className="w-4 h-4" />{error}</div>}
            {notice && <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold"><CheckCircle2 className="w-4 h-4 shrink-0" />{notice.text}</div>}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(types).map(([k, label]) => (
                    <div key={k} className="p-4 rounded-xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between"><span className={`text-xs font-bold px-2 py-0.5 rounded-md ${TYPE_TONE[k] || 'bg-slate-100 text-slate-600'}`}>{k}</span><span className="text-2xl font-bold text-slate-900">{counts[k] || 0}</span></div>
                        <div className="text-xs text-slate-500 mt-1">{label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={addLeave} className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                        <div className="flex flex-wrap gap-3 items-end">
                            <label className="block flex-[2] min-w-[190px]"><span className="text-xs font-bold text-slate-600">Staff</span>
                                <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} aria-label="Staff" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-navy">
                                    <option value="">Choose…</option>
                                    {employees.map(e => {
                                        const cl = clByEmployeeId.get(e.employee_id);
                                        return <option key={e.employee_id} value={e.employee_id}>{e.name} · {e.employee_id}{cl?.cl_balance != null ? ` · CL ${cl.cl_balance}` : ''}</option>;
                                    })}
                                </select></label>
                            <label className="block w-[128px]"><span className="text-xs font-bold text-slate-600">From</span>
                                <input type="date" value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value, to: f.to < e.target.value ? e.target.value : f.to }))} aria-label="Leave from date" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-800 outline-none focus:border-brand-navy" /></label>
                            <label className="block w-[128px]"><span className="text-xs font-bold text-slate-600">To</span>
                                <input type="date" value={form.to} min={form.from} onChange={e => setForm(f => ({ ...f, to: e.target.value }))} aria-label="Leave to date" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-800 outline-none focus:border-brand-navy" /></label>
                            <label className="block w-[112px]"><span className="text-xs font-bold text-slate-600">Type</span>
                                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} aria-label="Leave type" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-navy">
                                    {Object.keys(types).map(k => <option key={k} value={k}>{k}</option>)}
                                </select></label>
                            <label className="block flex-[3] min-w-[160px]"><span className="text-xs font-bold text-slate-600">Reason</span>
                                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="reason for leave" aria-label="Reason for requested leave" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-navy" /></label>
                            <button type="submit" disabled={saving || setupNeeded} className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-bold hover:bg-brand-navy-light disabled:opacity-50">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add leave
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>{dayCount > 1 ? `${dayCount} calendar days selected — ` : ''}Sundays and holidays in between are skipped automatically.</span>
                            {selectedCl && <span className="font-semibold text-brand-navy">{selectedCl.name}'s CL balance: {selectedCl.cl_balance ?? '—'}{selectedCl.cl_balance != null && form.type === 'CL' && dayCount > 0 && selectedCl.cl_balance < dayCount ? ' — this request may exceed the balance' : ''}</span>}
                        </div>
                    </form>

                    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-500">Leaves in {format(month, 'MMMM')}</span>
                            {leaveGroups.length > 0 && (
                                <button type="button" onClick={() => share(leaveGroups.map(shareText).join('\n\n'))} className="flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:underline">
                                    <Share2 className="w-3.5 h-3.5" /> Share list
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {loading && <div className="p-8 text-center text-slate-600 text-xs font-semibold"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>}
                            {!loading && leaves.length === 0 && <div className="p-8 text-center text-slate-600 text-xs font-semibold flex flex-col items-center gap-2"><CalendarOff className="w-6 h-6" />No leaves recorded this month.</div>}
                            {leaveGroups.map(group => {
                                const first = group[0], last = group[group.length - 1];
                                const status = groupStatus(group);
                                const dateLabel = group.length === 1
                                    ? format(new Date(first.date + 'T00:00:00'), 'EEE dd MMM')
                                    : `${format(new Date(first.date + 'T00:00:00'), 'EEE dd')} – ${format(new Date(last.date + 'T00:00:00'), 'EEE dd MMM')}`;
                                return (
                                    <div key={group.map(g => g.id).join(',')} className="flex items-center gap-3 px-4 py-3">
                                        <button type="button" aria-label={`View leave for ${first.employee?.name}`} onClick={() => setViewGroup(group)} className="w-10 h-10 rounded-full border-2 border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center font-bold text-xs text-brand-navy shrink-0">
                                            {avatars[first.employee?.employee_id] ? <img src={avatars[first.employee.employee_id]} alt="" className="w-full h-full object-cover" /> : initials(first.employee?.name)}
                                        </button>
                                        <button type="button" onClick={() => setViewGroup(group)} className="min-w-0 flex-1 text-left">
                                            <div className="text-sm font-bold text-slate-900 truncate">{first.employee?.name}</div>
                                            <div className="text-xs text-slate-500 truncate">{first.employee?.department} · <span className="font-mono">{first.employee?.employee_id}</span>{first.note ? ` · ${first.note}` : ''}</div>
                                        </button>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${TYPE_TONE[first.type] || 'bg-slate-100 text-slate-600'}`}>{first.type}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${STATUS_TONE[status]}`}>{status}</span>
                                        <div className="text-right w-36 shrink-0">
                                            <div className="font-mono text-xs text-slate-600 whitespace-nowrap">{dateLabel}</div>
                                            {group.length > 1 && <div className="text-xs text-slate-600">{group.length} days</div>}
                                        </div>
                                        {status === 'Pending' && (
                                            <>
                                                <button type="button" aria-label={`Approve leave for ${first.employee?.name}`} onClick={() => askDecision(group, 'Approved')} className="w-8 h-8 rounded-lg text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></button>
                                                <button type="button" aria-label={`Reject leave for ${first.employee?.name}`} onClick={() => askDecision(group, 'Rejected')} className="w-8 h-8 rounded-lg text-slate-600 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"><XCircle className="w-4 h-4" /></button>
                                            </>
                                        )}
                                        <button type="button" aria-label={`View leave for ${first.employee?.name}`} onClick={() => setViewGroup(group)} className="w-8 h-8 rounded-lg text-slate-600 hover:text-brand-navy hover:bg-slate-100 flex items-center justify-center"><Eye className="w-4 h-4" /></button>
                                        <button type="button" aria-label={`Share leave for ${first.employee?.name}`} onClick={() => share(shareText(group))} className="w-8 h-8 rounded-lg text-slate-600 hover:text-brand-navy hover:bg-slate-100 flex items-center justify-center"><Share2 className="w-4 h-4" /></button>
                                        <button type="button" aria-label={`Delete leave for ${first.employee?.name}`} onClick={() => removeGroup(group)} className="w-8 h-8 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2 text-xs font-bold text-slate-500"><Wallet className="w-4 h-4 text-brand-navy" /> CL balance — {format(month, 'MMMM yyyy')}</div>
                        <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                            {clRows.length === 0 && <div className="p-6 text-center text-slate-600 text-xs font-semibold">No CL data for this month yet.</div>}
                            {[...clRows].sort((a, b) => a.name.localeCompare(b.name)).map(r => (
                                <div key={r.employee_id} className="flex items-center gap-3 px-4 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-bold text-slate-800 truncate">{r.name}</div>
                                        <div className="text-xs text-slate-600 font-mono">{r.employee_id}{r.cl ? ` · ${r.cl} CL used` : ''}</div>
                                    </div>
                                    <span className={`text-sm font-bold tabular-nums ${r.cl_balance == null ? 'text-slate-500' : r.cl_balance < 0 ? 'text-red-600' : r.cl_balance === 0 ? 'text-slate-500' : 'text-emerald-600'}`}>
                                        {r.cl_balance == null ? '—' : r.cl_balance}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-600">Add or remove a CL leave above to adjust a balance — it recalculates here automatically.</div>
                    </div>

                    <form onSubmit={addHoliday} className="p-5 rounded-xl bg-white border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Sun className="w-4 h-4 text-amber-700" /> Holidays {month.getFullYear()}</div>
                        <input type="date" value={holForm.date} onChange={e => setHolForm(f => ({ ...f, date: e.target.value }))} aria-label="Holiday date" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono outline-none focus:border-brand-navy" />
                        <input value={holForm.name} onChange={e => setHolForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali" aria-label="Holiday name" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:border-brand-navy" />
                        <button type="submit" disabled={saving || setupNeeded} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-brand-navy text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Plus className="w-4 h-4" /> Add holiday</button>
                    </form>
                    <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
                        {holidays.length === 0 && <div className="p-6 text-center text-slate-600 text-xs font-semibold">No holidays entered for {month.getFullYear()}. Weekends (Sat, Sun) are already excluded from working days.</div>}
                        {holidays.map(h => (
                            <div key={h.date} className={`flex items-center gap-3 px-4 py-2.5 ${h.date >= from && h.date <= to ? '' : 'opacity-60'}`}>
                                <span className="font-mono text-xs text-slate-600 w-24">{format(new Date(h.date + 'T00:00:00'), 'EEE dd MMM')}</span>
                                <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{h.name}</span>
                                <button type="button" aria-label={`Delete holiday ${h.name}`} onClick={() => removeHoliday(h.date)} className="w-8 h-8 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <ViewModal
                group={viewGroup}
                types={types}
                avatar={viewGroup ? avatars[viewGroup[0].employee?.employee_id] : null}
                onShare={() => share(shareText(viewGroup))}
                onDecide={status => askDecision(viewGroup, status)}
                onDelete={() => removeGroup(viewGroup)}
                onClose={() => setViewGroup(null)}
            />
            <ApproverModal
                key={decision ? `${decision.group[0].id}-${decision.status}` : 'closed'}
                decision={decision}
                approvers={approvers}
                types={types}
                onPick={names => setGroupStatus(decision.group, decision.status, names)}
                onClose={() => setDecision(null)}
            />
        </div>
    );
}
