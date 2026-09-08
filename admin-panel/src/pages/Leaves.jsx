import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarOff, Plus, Trash2, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Sun } from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';
import useAvatars from '../hooks/useAvatars';

/**
 * Leave register: who is on CL / SL / EL / WFH / OD on which day, plus the
 * company holiday list. Both feed the monthly report (absent = working days
 * − present − leave) and the daily Attendance absent list.
 */
const TYPE_TONE = {
    CL: 'bg-brand-navy/10 text-brand-navy', SL: 'bg-rose-500/10 text-rose-600', EL: 'bg-violet-500/10 text-violet-700',
    WFH: 'bg-brand-teal/15 text-emerald-700', OD: 'bg-amber-500/10 text-amber-700',
};
const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function Leaves() {
    const [month, setMonth] = useState(() => new Date());
    const [types, setTypes] = useState({ CL: 'Casual leave', SL: 'Sick leave', EL: 'Earned leave', WFH: 'Work from home', OD: 'On duty (site / client visit)' });
    const [employees, setEmployees] = useState([]);
    const [leaves, setLeaves] = useState([]);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [setupNeeded, setSetupNeeded] = useState(false);
    const [form, setForm] = useState({ employee_id: '', date: todayISO(), type: 'CL', note: '' });
    const [holForm, setHolForm] = useState({ date: '', name: '' });
    const [saving, setSaving] = useState(false);

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
    }, [from, to, month]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        apiService.getUsers().then(list => {
            const arr = Array.isArray(list) ? list : (list?.users || []);
            setEmployees(arr.filter(u => u.status === 'Active' && !u.is_deleted).sort((a, b) => a.name.localeCompare(b.name)));
        }).catch(() => {});
        apiService.getLeaveTypes().then(d => { if (d?.types) setTypes(d.types); }).catch(() => {});
    }, []);

    const addLeave = async (e) => {
        e.preventDefault();
        if (!form.employee_id) { setError('Choose a staff member.'); return; }
        setSaving(true); setError('');
        try { await apiService.addLeave(form); setForm(f => ({ ...f, note: '' })); await load(); }
        catch (err) { setError(err?.response?.data?.error || 'Could not save leave'); }
        finally { setSaving(false); }
    };
    const removeLeave = async (id) => {
        try { await apiService.deleteLeave(id); setLeaves(ls => ls.filter(l => l.id !== id)); }
        catch (err) { setError(err?.response?.data?.error || 'Could not delete'); }
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
    const monthHolidays = holidays.filter(h => h.date >= from && h.date <= to);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 tracking-tighter">Leaves &amp; Holidays</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">
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
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div><b>Leave register is not set up yet.</b> Run <code className="font-mono">supabase/migration_v8_leaves.sql</code> once in the Supabase SQL editor, then reload this page.</div>
                </div>
            )}
            {error && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold"><AlertTriangle className="w-4 h-4" />{error}</div>}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(types).map(([k, label]) => (
                    <div key={k} className="p-4 rounded-2xl bg-white border border-slate-200">
                        <div className="flex items-center justify-between"><span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${TYPE_TONE[k] || 'bg-slate-100 text-slate-600'}`}>{k}</span><span className="text-2xl font-black text-slate-900">{counts[k] || 0}</span></div>
                        <div className="text-[11px] text-slate-500 mt-1">{label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={addLeave} className="p-5 rounded-2xl bg-white border border-slate-200 grid grid-cols-1 md:grid-cols-[1fr_150px_120px_1fr_auto] gap-3 items-end">
                        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Staff</span>
                            <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} aria-label="Staff" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-navy">
                                <option value="">Choose…</option>
                                {employees.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name} · {e.employee_id}</option>)}
                            </select></label>
                        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</span>
                            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} aria-label="Leave date" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-800 outline-none focus:border-brand-navy" /></label>
                        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</span>
                            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} aria-label="Leave type" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 outline-none focus:border-brand-navy">
                                {Object.keys(types).map(k => <option key={k} value={k}>{k}</option>)}
                            </select></label>
                        <label className="block"><span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Note</span>
                            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="optional" aria-label="Note" className="mt-1 w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 outline-none focus:border-brand-navy" /></label>
                        <button type="submit" disabled={saving || setupNeeded} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-bold hover:bg-brand-navy-light disabled:opacity-50">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add leave
                        </button>
                    </form>

                    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500">Leaves in {format(month, 'MMMM')}</div>
                        <div className="divide-y divide-slate-100">
                            {loading && <div className="p-8 text-center text-slate-400 text-xs font-semibold"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading…</div>}
                            {!loading && leaves.length === 0 && <div className="p-8 text-center text-slate-400 text-xs font-semibold flex flex-col items-center gap-2"><CalendarOff className="w-6 h-6" />No leaves recorded this month.</div>}
                            {leaves.map(l => (
                                <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="w-10 h-10 rounded-full border-2 border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center font-bold text-xs text-brand-navy shrink-0">
                                        {avatars[l.employee?.employee_id] ? <img src={avatars[l.employee.employee_id]} alt="" className="w-full h-full object-cover" /> : initials(l.employee?.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-bold text-slate-900 truncate">{l.employee?.name}</div>
                                        <div className="text-[11px] text-slate-500 truncate">{l.employee?.department} · <span className="font-mono">{l.employee?.employee_id}</span>{l.note ? ` · ${l.note}` : ''}</div>
                                    </div>
                                    <span className={`text-[11px] font-black px-2 py-0.5 rounded-md ${TYPE_TONE[l.type] || 'bg-slate-100 text-slate-600'}`}>{l.type}</span>
                                    <span className="font-mono text-xs text-slate-600 w-24 text-right">{format(new Date(l.date + 'T00:00:00'), 'EEE dd MMM')}</span>
                                    <button type="button" aria-label={`Delete leave for ${l.employee?.name}`} onClick={() => removeLeave(l.id)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <form onSubmit={addHoliday} className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500"><Sun className="w-4 h-4 text-amber-500" /> Holidays {month.getFullYear()}</div>
                        <input type="date" value={holForm.date} onChange={e => setHolForm(f => ({ ...f, date: e.target.value }))} aria-label="Holiday date" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono outline-none focus:border-brand-navy" />
                        <input value={holForm.name} onChange={e => setHolForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali" aria-label="Holiday name" className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm outline-none focus:border-brand-navy" />
                        <button type="submit" disabled={saving || setupNeeded} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-brand-navy text-sm font-bold hover:bg-slate-50 disabled:opacity-50"><Plus className="w-4 h-4" /> Add holiday</button>
                    </form>
                    <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
                        {holidays.length === 0 && <div className="p-6 text-center text-slate-400 text-xs font-semibold">No holidays entered for {month.getFullYear()}. Weekends (Sat, Sun) are already excluded from working days.</div>}
                        {holidays.map(h => (
                            <div key={h.date} className={`flex items-center gap-3 px-4 py-2.5 ${h.date >= from && h.date <= to ? '' : 'opacity-60'}`}>
                                <span className="font-mono text-xs text-slate-600 w-24">{format(new Date(h.date + 'T00:00:00'), 'EEE dd MMM')}</span>
                                <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{h.name}</span>
                                <button type="button" aria-label={`Delete holiday ${h.name}`} onClick={() => removeHoliday(h.date)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
