import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, Fingerprint, ScanFace,
    ChevronLeft, ChevronRight, FileText,
    Download, Activity, Monitor,
    User, AlertTriangle, Loader2,
    CheckCircle2, X, ArrowLeft, ShieldCheck, ShieldAlert, ShieldQuestion
} from 'lucide-react';
import { apiService } from '../services/api';
import { format, startOfWeek, startOfMonth, parseISO } from 'date-fns';

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (iso) => iso ? format(parseISO(iso), 'MMM dd, yyyy') : '—';
const fmtTime = (iso) => iso ? format(parseISO(iso), 'HH:mm:ss') : '—';

function StatusBadge({ status }) {
    const map = {
        success: { label: 'Granted', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: ShieldCheck },
        failed: { label: 'Denied', bg: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: ShieldAlert },
        ambiguous: { label: 'Ambiguous', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: ShieldQuestion },
        warning: { label: 'Warning', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20', Icon: ShieldAlert },
    };
    const s = map[status] || map.failed;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${s.bg}`}>
            <s.Icon className="w-3 h-3" />
            {s.label}
        </span>
    );
}

function MethodBadge({ method }) {
    const isFace = method === 'face';
    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
            ${isFace ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-purple-500/10 border-purple-500/20 text-purple-400'}`}>
            {isFace ? <ScanFace className="w-3 h-3" /> : <Fingerprint className="w-3 h-3" />}
            {method || '—'}
        </div>
    );
}

export default function EmployeeAccess() {
    const { employee_id } = useParams();
    const navigate = useNavigate();
    
    const [employee, setEmployee] = useState(null);
    const [logs, setLogs] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [totalRecords, setTotalRecords] = useState(0);

    // Filters
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [activePreset, setActivePreset] = useState('month');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [page, setPage] = useState(1);

    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    useEffect(() => {
        fetchData();
        fetchSummary();
    }, [employee_id, startDate, endDate, page]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await apiService.getEmployeeAccessLogs(employee_id, {
                startDate, endDate, page, limit: PAGE_SIZE
            });
            setLogs(result.logs || []);
            setTotalRecords(result.total || 0);
            
            // If logs exist, we can extract employee details from the first one
            if (result.logs?.[0]?.employees) {
                setEmployee(result.logs[0].employees);
            } else if (!employee) {
                // Fallback: fetch users list to find this employee if no logs found yet
                const users = await apiService.getUsers();
                const emp = users.find(u => u.employee_id === employee_id || u.id === employee_id);
                if (emp) setEmployee(emp);
            }
        } catch (err) {
            console.error('Failed to fetch employee access logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const data = await apiService.getEmployeeAccessSummary(employee_id);
            setSummary(data);
        } catch (err) {
            console.error('Failed to fetch summary:', err);
        }
    };

    const applyPreset = (preset) => {
        const now = new Date();
        const t = format(now, 'yyyy-MM-dd');
        setActivePreset(preset);
        setPage(1);
        if (preset === 'today') { setStartDate(t); setEndDate(t); }
        if (preset === 'week') { setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')); setEndDate(t); }
        if (preset === 'month') { 
            const sm = parseInt(selectedMonth);
            const sy = parseInt(selectedYear);
            const start = new Date(sy, sm - 1, 1);
            const end = new Date(sy, sm, 0);
            setStartDate(format(start, 'yyyy-MM-dd')); 
            setEndDate(format(end, 'yyyy-MM-dd')); 
        }
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const params = { 
                employeeId: employee_id, 
                startDate, 
                endDate 
            };
            if (activePreset === 'month') {
                params.month = selectedMonth;
                params.year = selectedYear;
            }
            const blob = await apiService.exportAccessLogsExcel(params);
            const filename = `access_history_${employee?.employee_id || employee_id}_${startDate}.xlsx`;
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) { console.error('Export failed:', err); }
        finally { setExporting(false); }
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const params = { 
                employeeId: employee_id, 
                startDate, 
                endDate 
            };
            if (activePreset === 'month') {
                params.month = selectedMonth;
                params.year = selectedYear;
            }
            const blob = await apiService.exportAccessLogsPDF(params);
            const filename = `access_history_${employee?.employee_id || employee_id}_${startDate}.pdf`;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) { console.error('PDF export failed:', err); }
        finally { setExportingPdf(false); }
    };

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    const inputCls = 'w-full bg-slate-950 border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/30 transition-colors';

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] text-slate-400 hover:text-white transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                            <h1 className="text-xl md:text-3xl font-black text-white tracking-tighter truncate">{employee?.name || 'Loading...'}</h1>
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[9px] md:text-[10px] font-bold text-blue-400 uppercase tracking-widest shrink-0">
                                {employee?.employee_id}
                            </span>
                        </div>
                        <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em] truncate">
                            {employee?.department || 'Registry'} // Access History
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleExportPdf} disabled={exportingPdf}
                        className="flex items-center gap-2 px-5 py-2.5 bg-rose-600/80 hover:bg-rose-600 disabled:opacity-60 border border-rose-500/40 rounded-xl text-white text-xs font-black transition-all">
                        {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export PDF
                    </button>
                    <button onClick={handleExportExcel} disabled={exporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-xl text-white text-xs font-black transition-all">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export Excel
                    </button>
                </div>
            </div>

            {/* ── Summary Stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Scans', value: summary?.total_scans, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                    { label: 'Today', value: summary?.today_scans, icon: Calendar, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    { label: 'This Month', value: summary?.this_month_scans, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { label: 'Last Access', value: summary?.last_scan ? format(parseISO(summary.last_scan), 'HH:mm') : '—', icon: CheckCircle2, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
                ].map(s => (
                    <div key={s.label} className={`p-4 rounded-2xl border ${s.bg} flex items-center gap-3 transition-all hover:brightness-110`}>
                        <div className={`w-9 h-9 rounded-xl bg-black/20 flex items-center justify-center ${s.color}`}>
                            <s.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className={`text-xl font-black tabular-nums ${s.color}`}>{loading ? '—' : s.value}</div>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filters ── */}
            <div className="p-4 md:p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex flex-col gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mr-1">Quick Filters:</span>
                    {[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month']].map(([key, label]) => (
                        <button key={key} onClick={() => applyPreset(key)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border
                                ${activePreset === key ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/[0.03] border-white/[0.06] text-slate-500'}`}>
                            {label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <select 
                            value={selectedMonth} 
                            onChange={e => {
                                setSelectedMonth(e.target.value); 
                                if (activePreset === 'month') {
                                    const sm = parseInt(e.target.value);
                                    const sy = parseInt(selectedYear);
                                    const start = new Date(sy, sm - 1, 1);
                                    const end = new Date(sy, sm, 0);
                                    setStartDate(format(start, 'yyyy-MM-dd')); 
                                    setEndDate(format(end, 'yyyy-MM-dd'));
                                }
                            }} 
                            className={`${inputCls} !w-auto flex-1 md:flex-none`}
                        >
                            {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                    {format(new Date(2024, i, 1), 'MMMM')}
                                </option>
                            ))}
                        </select>
                        <select 
                            value={selectedYear} 
                            onChange={e => {
                                setSelectedYear(e.target.value);
                                if (activePreset === 'month') {
                                    const sm = parseInt(selectedMonth);
                                    const sy = parseInt(e.target.value);
                                    const start = new Date(sy, sm - 1, 1);
                                    const end = new Date(sy, sm, 0);
                                    setStartDate(format(start, 'yyyy-MM-dd')); 
                                    setEndDate(format(end, 'yyyy-MM-dd'));
                                }
                            }} 
                            className={`${inputCls} !w-auto flex-1 md:flex-none`}
                        >
                            {[2024, 2025, 2026].map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setActivePreset('custom');}} className={inputCls} />
                        <span className="text-slate-700">–</span>
                        <input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setActivePreset('custom');}} className={inputCls} />
                    </div>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/[0.03] bg-white/[0.01]">
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                                <th className="hidden sm:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Time</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Method</th>
                                <th className="hidden lg:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Confidence</th>
                                <th className="hidden md:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Device</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.025]">
                            {loading ? Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {Array(6).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><div className="h-6 bg-white/[0.04] rounded-lg" /></td>)}
                                </tr>
                            )) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-500 uppercase font-black text-xs tracking-widest">
                                            <Activity className="w-12 h-12 text-slate-800" />
                                            No access records for this period
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs font-bold text-slate-300">{fmtDate(log.created_at)}</span>
                                            <span className="sm:hidden text-[10px] font-bold text-slate-500">{fmtTime(log.created_at)}</span>
                                        </div>
                                    </td>
                                    <td className="hidden sm:table-cell px-6 py-4">
                                        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400"><Clock className="w-3.5 h-3.5 text-slate-600" />{fmtTime(log.created_at)}</div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-center"><MethodBadge method={log.method} /></td>
                                    <td className="hidden lg:table-cell px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-16 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                <div className={`h-full rounded-full ${log.confidence >= 0.8 ? 'bg-emerald-500' : log.confidence >= 0.6 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                                     style={{ width: `${Math.round((log.confidence || 0) * 100)}%` }} />
                                            </div>
                                            <span className="text-[10px] font-black text-slate-500 w-8">{Math.round((log.confidence || 0) * 100)}%</span>
                                        </div>
                                    </td>
                                    <td className="hidden md:table-cell px-6 py-4 text-center text-xs font-bold text-slate-500 font-mono">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <Monitor className="w-3 h-3" />
                                            {log.device_id || 'terminal_01'}
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-right"><StatusBadge status={log.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-8 py-5 border-t border-white/[0.03] flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Page <span className="text-white">{page}</span> of <span className="text-white">{totalPages}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] text-slate-400 hover:text-white disabled:opacity-20"><ChevronLeft className="w-4 h-4" /></button>
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.05] text-slate-400 hover:text-white disabled:opacity-20"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
