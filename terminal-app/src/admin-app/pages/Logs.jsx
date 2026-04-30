import React, { useState, useEffect, useCallback } from 'react';
import {
    ShieldCheck, ShieldAlert, ShieldQuestion, Search, Filter,
    RefreshCw, Clock, Monitor, Activity, ChevronLeft, ChevronRight,
    ScanFace, Fingerprint, CreditCard, User, Loader2, X, Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { apiService } from '../services/api';
import { downloadFile } from '../utils/download';

const PAGE_SIZE = 20;

// ── Status badge ───────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const map = {
        success: { label: 'Granted', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', Icon: ShieldCheck },
        failed: { label: 'Denied', bg: 'bg-red-500/10    text-red-400    border-red-500/20', Icon: ShieldAlert },
        ambiguous: { label: 'Ambiguous', bg: 'bg-amber-500/10  text-amber-400  border-amber-500/20', Icon: ShieldQuestion },
        warning: { label: 'Warning', bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20', Icon: ShieldAlert },
    };
    const s = map[status] || map.failed;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${s.bg}`}>
            <s.Icon className="w-3 h-3" />
            {s.label}
        </span>
    );
};

// ── Method badge ───────────────────────────────────────────────────────────────
const MethodBadge = ({ method }) => {
    const m = (method || 'face').toLowerCase();
    const isFace = m === 'face';
    const isFinger = m === 'fingerprint' || m === 'finger';
    const isRemote = m === 'remote';
    
    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border
            ${isFace ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 
              isFinger ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 
              isRemote ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
            {isFace ? <ScanFace className="w-3 h-3" /> : isFinger ? <Fingerprint className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
            {method || 'Face'}
        </div>
    );
};

// ── Confidence bar ─────────────────────────────────────────────────────────────
const ConfidenceBar = ({ value }) => {
    if (value == null) return <span className="text-slate-700 text-[11px]">—</span>;
    const pct = Math.round(value * 100);
    const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2 w-28">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{pct}%</span>
        </div>
    );
};

// ── Stat pill ─────────────────────────────────────────────────────────────────
const StatPill = ({ label, value, color, icon: Icon }) => (
    <div className="flex items-center gap-2.5 px-3 py-2 bg-white border border-slate-200 shadow-sm rounded-xl min-w-fit flex-1">
        <div className={`w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center ${color}`}>
            <Icon className="w-3.5 h-3.5" />
        </div>
        <div>
            <p className="text-sm font-black text-slate-900 leading-none">{value ?? '--'}</p>
            <p className="text-[8px] font-bold uppercase tracking-widest text-slate-500 mt-0.5">{label}</p>
        </div>
    </div>
);

export default function Logs() {
    const navigate = useNavigate();
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [refreshing, setRefreshing] = useState(false);
    const [showDownloadMenu, setShowDownloadMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(null); // 'excel' or 'pdf'

    // Filters
    const today = format(new Date(), 'yyyy-MM-dd');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [method, setMethod] = useState('');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);

    const fetchLogs = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            const params = {
                page,
                limit: PAGE_SIZE,
                search,
                status,
                method,
                startDate,
                endDate
            };
            const res = await apiService.getAccessLogs(params);
            setLogs(res.logs || []);
            setTotal(res.total || res.pagination?.total || 0);
        } catch (err) {
            console.error('Failed to fetch logs', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [page, search, status, method, startDate, endDate]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // Auto-refresh every 30s
    useEffect(() => {
        const t = setInterval(() => fetchLogs(true), 30_000);
        return () => clearInterval(t);
    }, [fetchLogs]);

    const resetFilters = () => {
        setSearch(''); setStatus(''); setMethod('');
        setStartDate(today); setEndDate(today); setPage(1);
    };

    const handleExport = async (type) => {
        setIsExporting(type);
        setShowDownloadMenu(false);
        try {
            const params = { search, status, method, startDate, endDate };
            const data = type === 'excel' 
                ? await apiService.exportAccessLogsExcel(params)
                : await apiService.exportAccessLogsPDF(params);
            
            const filename = `access_logs_${format(new Date(), 'yyyy-MM-dd')}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
            const mimeType = type === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
            
            await downloadFile(data, filename, mimeType);
        } catch (err) {
            console.error(`Export ${type} failed:`, err);
            alert(`Export failed: ${err.message}`);
        } finally {
            setIsExporting(null);
        }
    };

    const hasFilter = search || status || method || startDate !== today || endDate !== today;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    // Summary counts from loaded page
    const granted = logs.filter(l => l.status === 'success').length;
    const denied = logs.filter(l => l.status === 'failed').length;
    const ambiguous = logs.filter(l => l.status === 'ambiguous').length;

    const inputCls = 'bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-blue-500/50 transition-colors';
    const selCls = `${inputCls} appearance-none cursor-pointer`;

    return (
        <div className="space-y-6 animate-in fade-in duration-700">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 mb-1 tracking-tighter">Security Audit Log</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm">Real-time biometric access events &mdash; every scan attempt recorded</p>
                </div>
                <button onClick={() => fetchLogs(true)} disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold transition-all disabled:opacity-50">
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh
                </button>
            </div>

            {/* ── Stat pills ── */}
            <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar scrollbar-hide">
                <StatPill label="Events" value={total} color="text-blue-600" icon={Activity} />
                <StatPill label="Granted" value={granted} color="text-emerald-600" icon={ShieldCheck} />
                <StatPill label="Denied" value={denied} color="text-red-600" icon={ShieldAlert} />
                <StatPill label="Unknown" value={ambiguous} color="text-amber-500" icon={ShieldQuestion} />
            </div>

            {/* ── Filters ── */}
            <div className="p-2 bg-white border border-slate-200 shadow-sm rounded-2xl">
                <div className="flex flex-col lg:flex-row gap-2">
                    <div className="flex flex-1 gap-2">
                        <div className="relative flex-1 min-w-[120px]">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input type="text" placeholder="Search name..." value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1); }}
                                className="w-full bg-transparent border-none text-xs font-bold text-slate-700 placeholder:text-slate-400 pl-9 py-2.5 focus:ring-0" />
                        </div>
                        <div className="flex items-center gap-1 px-1 border-l border-slate-100">
                            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} 
                                className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer">
                                <option value="">All Status</option>
                                <option value="success">Granted</option>
                                <option value="failed">Denied</option>
                                <option value="ambiguous">Ambiguous</option>
                            </select>
                            <select value={method} onChange={e => { setMethod(e.target.value); setPage(1); }} 
                                className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase tracking-widest focus:ring-0 cursor-pointer border-l border-slate-100 pl-2">
                                <option value="">All Methods</option>
                                <option value="FACE">Face</option>
                                <option value="FINGERPRINT">Finger</option>
                                <option value="REMOTE">Remote</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 border-t lg:border-t-0 lg:border-l border-slate-100 pt-2 lg:pt-0 lg:pl-2 px-2">
                        <input type="date" value={startDate} max={endDate}
                            onChange={e => { setStartDate(e.target.value); setPage(1); }} 
                            className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase focus:ring-0 cursor-pointer" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">To</span>
                        <input type="date" value={endDate} min={startDate}
                            onChange={e => { setEndDate(e.target.value); setPage(1); }} 
                            className="bg-transparent border-none text-[10px] font-black text-slate-600 uppercase focus:ring-0 cursor-pointer" />
                        
                        {hasFilter && (
                            <button onClick={resetFilters} className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors ml-auto">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Table ── */}
            <div className="card !p-0 overflow-hidden bg-white border border-slate-200 shadow-sm rounded-3xl">
                {/* Table header bar */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Live Access Stream</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button onClick={() => setShowDownloadMenu(!showDownloadMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-black text-slate-700 uppercase tracking-widest transition-all">
                                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Export
                            </button>
                            {showDownloadMenu && (
                                <>
                                    <div className="fixed inset-0 z-20" onClick={() => setShowDownloadMenu(false)} />
                                    <div className="absolute right-0 mt-2 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <button onClick={() => handleExport('excel')} className="w-full px-4 py-2 text-left text-[10px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50 border-b border-slate-100">Excel</button>
                                        <button onClick={() => handleExport('pdf')} className="w-full px-4 py-2 text-left text-[10px] font-black text-slate-700 uppercase tracking-widest hover:bg-slate-50">PDF</button>
                                    </div>
                                </>
                            )}
                        </div>
                        <span className="hidden sm:inline text-[10px] text-slate-400 font-bold uppercase tracking-widest">{total} Total</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                                <th className="px-4 md:px-6 py-3">Subject</th>
                                <th className="px-4 md:px-6 py-3">Method</th>
                                <th className="hidden lg:table-cell px-6 py-3">Timestamp</th>
                                <th className="hidden xl:table-cell px-6 py-3">Confidence</th>
                                <th className="hidden md:table-cell px-6 py-3">Device</th>
                                <th className="px-4 md:px-6 py-3 text-right">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {Array.from({ length: 6 }).map((_, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-4 bg-slate-100 rounded-lg" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-24 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-30">
                                            <Activity className="w-10 h-10 text-blue-400 animate-pulse" />
                                            <p className="font-bold uppercase tracking-widest text-xs">No events found</p>
                                            {hasFilter && <p className="text-slate-600 text-xs">Try adjusting your filters</p>}
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.map(log => (
                                <tr key={log.id}
                                    onClick={() => log.employees?.employee_id && navigate(`/admin/access/employee/${log.employees.employee_id}`)}
                                    className={`hover:bg-slate-50 cursor-pointer transition-all duration-300 group active:scale-[0.995] ${log.status === 'failed' ? 'border-l-2 border-red-500/30' : log.status === 'ambiguous' ? 'border-l-2 border-amber-500/30' : 'border-l-2 border-transparent'}`}>

                                    {/* Subject */}
                                    <td className="px-4 md:px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                                                {log.employees?.image_url
                                                    ? <img src={log.employees.image_url} alt="" className="w-full h-full object-cover" />
                                                    : <div className="w-full h-full flex items-center justify-center text-slate-500 font-black text-[10px]">
                                                        {log.employees?.name?.[0] || '?'}
                                                    </div>}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-bold text-slate-900 leading-tight truncate">
                                                    {log.employees?.name ? log.employees.name : (
                                                        (log.method || log.metadata?.method) === 'REMOTE' ? 'Remote Unlock' : 
                                                        (log.method || log.metadata?.method) === 'FINGERPRINT' ? 'Unknown Fingerprint' : 'Unknown Person'
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-600 font-medium truncate">
                                                    {log.employees?.employee_id || (log.method === 'REMOTE' ? 'Admin Panel' : 'No ID')}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Method */}
                                    <td className="px-4 md:px-6 py-4">
                                        <MethodBadge method={log.method || log.metadata?.method} />
                                    </td>

                                    {/* Timestamp */}
                                    <td className="hidden lg:table-cell px-6 py-4">
                                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                                            <Clock className="w-3 h-3 text-slate-600 shrink-0" />
                                            <div>
                                                <div>{format(parseISO(log.created_at), 'dd MMM yyyy')}</div>
                                                <div className="text-slate-600">{format(parseISO(log.created_at), 'HH:mm:ss')}</div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Confidence */}
                                    <td className="hidden xl:table-cell px-6 py-4"><ConfidenceBar value={log.confidence} /></td>

                                    {/* Device */}
                                    <td className="hidden md:table-cell px-6 py-4">
                                        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                                            <Monitor className="w-3.5 h-3.5 text-slate-700" />
                                            {log.device_id || 'terminal_01'}
                                        </span>
                                    </td>

                                    {/* Result */}
                                    <td className="px-4 md:px-6 py-4 text-right">
                                        <StatusBadge status={log.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-4 bg-slate-50">
                        <span className="text-[11px] text-slate-500 font-bold">
                            Page {page} of {totalPages} &bull; {total} events
                        </span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors">
                                <ChevronLeft className="w-4 h-4 text-slate-500" />
                            </button>
                            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                                const pg = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
                                if (pg < 1 || pg > totalPages) return null;
                                return (
                                    <button key={pg} onClick={() => setPage(pg)}
                                        className={`w-7 h-7 rounded-lg text-[11px] font-black transition-all ${pg === page
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                            : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}`}>
                                        {pg}
                                    </button>
                                );
                            })}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors">
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
