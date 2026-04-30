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
import { downloadFile } from '../utils/download';

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
    const m = (method || 'face').toLowerCase(); // Default to face if missing
    const isFace = m === 'face';
    const isFinger = m === 'fingerprint' || m === 'finger';
    const isRemote = m === 'remote';
    
    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
            ${isFace ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 
              isFinger ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 
              isRemote ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
            {isFace ? <ScanFace className="w-3 h-3" /> : isFinger ? <Fingerprint className="w-3 h-3" /> : isRemote ? <Monitor className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {method || 'Face'}
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
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);

    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    useEffect(() => {
        fetchData();
        fetchSummary();
    }, [employee_id, startDate, endDate, page]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await apiService.getEmployeeAccessLogs(employee_id, {
                startDate, endDate, page, limit: PAGE_SIZE, status: statusFilter
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
            const data = await apiService.exportAccessLogsExcel(params);
            const filename = `access_history_${employee?.employee_id || employee_id}_${startDate}.xlsx`;
            await downloadFile(data, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        } catch (err) { 
            console.error('Export failed:', err); 
            alert('Export failed: ' + (err.message || 'Unknown error'));
        } finally { setExporting(false); }
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
            const data = await apiService.exportAccessLogsPDF(params);
            const filename = `access_history_${employee?.employee_id || employee_id}_${startDate}.pdf`;
            await downloadFile(data, filename, 'application/pdf');
        } catch (err) { 
            console.error('PDF export failed:', err); 
            alert('PDF Export failed: ' + (err.message || 'Unknown error'));
        } finally { setExportingPdf(false); }
    };

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

    return (
        <div className="space-y-8 animate-in fade-in duration-700 w-full max-w-[100vw] min-w-0 pb-10">
            {/* ── Header ── */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                    <button onClick={() => navigate(-1)} className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-900 transition-all shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                            <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter truncate">{employee?.name || 'Loading...'}</h1>
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[9px] md:text-[10px] font-bold text-blue-600 uppercase tracking-widest shrink-0">
                                {employee?.employee_id}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">
                                {employee?.department || 'Registry'} // Access History
                            </p>
                            <span className="text-slate-300 hidden md:inline">•</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => navigate(`/admin/attendance/${employee_id}`)} className="text-[10px] md:text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                                    <Calendar className="w-3 h-3" /> View Attendance
                                </button>
                                <button onClick={() => navigate(`/admin/users?edit=${employee_id}`)} className="text-[10px] md:text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                                    <User className="w-3 h-3" /> Manage Profile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <button onClick={() => setShowExportMenu(!showExportMenu)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-xs font-black shadow-md shadow-blue-500/20 transition-all">
                            {exporting || exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Export Data
                        </button>
                        {showExportMenu && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowExportMenu(false)} />
                                <div className="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <button onClick={() => { setShowExportMenu(false); handleExportExcel(); }} className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                                        <Download className="w-3.5 h-3.5 text-emerald-500" /> Excel (.xlsx)
                                    </button>
                                    <button onClick={() => { setShowExportMenu(false); handleExportPdf(); }} className="w-full px-4 py-3 text-left text-[11px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 flex items-center gap-2">
                                        <FileText className="w-3.5 h-3.5 text-rose-500" /> PDF Report
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Summary Stats ── */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar scrollbar-hide">
                {[
                    { label: 'Total', value: summary?.total_scans, icon: Activity, color: 'text-blue-600' },
                    { label: 'Today', value: summary?.today_scans, icon: Calendar, color: 'text-emerald-600' },
                    { label: 'Month', value: summary?.this_month_scans, icon: Clock, color: 'text-amber-500' },
                    { label: 'Last', value: summary?.last_scan ? format(parseISO(summary.last_scan), 'HH:mm') : '—', icon: CheckCircle2, color: 'text-teal-600' },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 shadow-sm rounded-xl min-w-fit flex-1">
                        <div className={`w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center ${s.color}`}>
                            <s.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-sm font-black text-slate-900 leading-none tabular-nums">{loading ? '—' : s.value}</div>
                            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filters ── */}
            <div className="p-2 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex flex-col lg:flex-row gap-2">
                    <div className="flex flex-col sm:flex-row flex-1 gap-2">
                        <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-50 rounded-xl border border-slate-100 min-w-fit justify-between sm:justify-start">
                            {[['today', 'Today'], ['week', 'Week'], ['month', 'Month']].map(([key, label]) => (
                                <button key={key} onClick={() => applyPreset(key)}
                                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all
                                        ${activePreset === key ? 'bg-white border border-slate-200 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1 px-1 flex-1 min-w-0">
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
                                className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer flex-1 min-w-0"
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
                                className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer border-l border-slate-100 pl-2"
                            >
                                {[2024, 2025, 2026].map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-t lg:border-t-0 lg:border-l border-slate-100 pt-2 lg:pt-0 lg:pl-2 px-2 overflow-x-auto no-scrollbar">
                        <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setActivePreset('custom');}} 
                            className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase focus:ring-0 cursor-pointer" />
                        <span className="text-[10px] text-slate-300 font-black">TO</span>
                        <input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setActivePreset('custom');}} 
                            className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase focus:ring-0 cursor-pointer" />
                        
                        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} 
                            className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer border-l border-slate-100 pl-2 ml-auto">
                            <option value="">Status</option>
                            <option value="success">Granted</option>
                            <option value="failed">Denied</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Details</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date & Time</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Method</th>
                                <th className="hidden md:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Device</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {Array(5).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><div className="h-6 bg-slate-100 rounded-lg" /></td>)}
                                </tr>
                            )) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-400 uppercase font-black text-xs tracking-widest">
                                            <Activity className="w-12 h-12 text-slate-300" />
                                            No access records
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.map((log) => (
                                <tr key={log.id} className="group hover:bg-slate-50 transition-colors">
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 hidden sm:flex items-center justify-center">
                                                {employee?.image_url ? <img src={employee.image_url} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-slate-400" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-black text-slate-900 truncate">{employee?.name || 'Unknown'}</div>
                                                <div className="text-[9px] font-bold text-slate-500 truncate uppercase tracking-widest">{employee?.employee_id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black text-slate-700">{fmtDate(log.created_at)}</span>
                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {fmtTime(log.created_at)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-center"><MethodBadge method={log.method || log.metadata?.method} /></td>
                                    <td className="hidden md:table-cell px-6 py-4 text-center">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{log.device_id || 'T-01'}</span>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-right"><StatusBadge status={log.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            Page <span className="text-slate-900">{page}</span> of <span className="text-slate-900">{totalPages}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-900 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-500 hover:text-slate-900 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
