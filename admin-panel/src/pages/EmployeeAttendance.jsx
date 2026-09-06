import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Calendar, Clock, Fingerprint, ScanFace,
    ChevronLeft, ChevronRight, FileText,
    Briefcase, Download, ArrowUp, ArrowDown,
    User, UserCheck, Timer, AlertTriangle, Loader2,
    CheckCircle2, X, ArrowLeft, Camera, Mail, ShieldCheck
} from 'lucide-react';
import { apiService } from '../services/api';
import AttendancePhotoModal from '../components/AttendancePhotoModal';
import { format, startOfWeek, startOfMonth, subDays } from 'date-fns';

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (iso) => iso ? format(new Date(iso), 'HH:mm:ss') : '—';
const fmtDate = (d) => d ? format(new Date(d), 'MMM dd, yyyy') : '—';

const workHoursDisplay = (record) => {
    if (record.working_hours != null) {
        const h = Math.floor(record.working_hours);
        const m = Math.round((record.working_hours - h) * 60);
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }
    return '—';
};

function StatusBadge({ status }) {
    if (status === 'LATE')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Late
            </span>
        );
    if (status === 'ON_TIME')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />On Time
            </span>
        );
    return <span className="text-[10px] text-slate-600 font-bold">—</span>;
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

export default function EmployeeAttendance() {
    const { employee_id } = useParams();
    const navigate = useNavigate();
    
    const [employee, setEmployee] = useState(null);
    const [attendance, setAttendance] = useState([]);
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

    // Photo viewer: { record, kind: 'in' | 'out' } or null
    const [photoView, setPhotoView] = useState(null);

    useEffect(() => {
        fetchData();
        fetchSummary();
    }, [employee_id, startDate, endDate, page]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await apiService.getEmployeeAttendance(employee_id, {
                startDate, endDate, page, limit: PAGE_SIZE
            });
            setAttendance(result.data || []);
            setTotalRecords(result.total || 0);
            if (result.employee) setEmployee(result.employee);
        } catch (err) {
            console.error('Failed to fetch employee attendance:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const data = await apiService.getEmployeeAttendanceSummary(employee_id, { startDate, endDate });
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
            const params = { startDate, endDate };
            if (activePreset === 'month') {
                params.month = selectedMonth;
                params.year = selectedYear;
            }
            const blob = await apiService.exportEmployeeAttendanceExcel(employee_id, params);
            const filename = `attendance_${employee?.employee_id || employee_id}_${startDate}_to_${endDate}.xlsx`;
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) { 
            console.error('Export failed:', err); 
            alert('Excel Export failed. Please check logs.');
        }
        finally { setExporting(false); }
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const params = { startDate, endDate };
            if (activePreset === 'month') {
                params.month = selectedMonth;
                params.year = selectedYear;
            }
            const blob = await apiService.exportEmployeeAttendancePDF(employee_id, params);
            const filename = `attendance_${employee?.employee_id || employee_id}_${startDate}_to_${endDate}.pdf`;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) { 
            console.error('PDF export failed:', err); 
            alert('PDF Export failed. Please check logs.');
        }
        finally { setExportingPdf(false); }
    };

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    const inputCls = 'w-full bg-slate-950 border border-white/[0.07] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/30 transition-colors';

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* ── Profile hero: big latest-scan photo + full details ── */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex items-start gap-4 md:gap-6 min-w-0">
                    <button onClick={() => navigate(-1)} aria-label="Back"
                        className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-900 transition-all shrink-0 mt-1">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-28 h-28 md:w-40 md:h-40 shrink-0 rounded-3xl overflow-hidden bg-slate-100 border border-slate-200 shadow-lg flex items-center justify-center">
                        {(employee?.avatar_url || employee?.image_url)
                            ? <img src={employee.avatar_url || employee.image_url} alt={employee?.name || ''} className="w-full h-full object-cover" />
                            : <span className="text-3xl font-black text-emerald-500">{(employee?.name || '?').slice(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                            <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter truncate">{employee?.name || 'Loading...'}</h1>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[9px] md:text-[10px] font-bold text-emerald-700 uppercase tracking-widest shrink-0 font-mono">
                                {employee?.employee_id}
                            </span>
                            {employee?.status && (
                                <span className={`px-2 py-0.5 rounded-md text-[9px] md:text-[10px] font-black uppercase tracking-widest shrink-0
                                    ${employee.status === 'Active' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'}`}>
                                    {employee.status}
                                </span>
                            )}
                        </div>
                        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600">
                            <div className="flex items-center gap-2"><Briefcase className="w-3.5 h-3.5 text-slate-400 shrink-0" /><dt className="sr-only">Department</dt><dd>{employee?.department || 'General'}</dd></div>
                            <div className="flex items-center gap-2 min-w-0"><Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" /><dt className="sr-only">Email</dt><dd className="truncate">{employee?.email || '—'}</dd></div>
                            <div className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" /><dt className="sr-only">Role</dt><dd className="capitalize">{employee?.role || 'employee'}</dd></div>
                            <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" /><dt className="sr-only">Joined</dt><dd>Since {employee?.created_at ? format(new Date(employee.created_at), 'dd MMM yyyy') : '—'}</dd></div>
                        </dl>
                        <p className="mt-2 text-[10px] text-slate-400 uppercase tracking-[0.2em]">
                            {employee?.avatar_url ? 'Photo from latest terminal scan' : 'No terminal photo yet'} // Attendance history
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
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
                    { label: 'Working Days', value: summary?.present_days, icon: UserCheck, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                    { label: 'Total Hours', value: `${summary?.total_work_hours}h`, icon: Clock, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    { label: 'Late Days', value: summary?.late_days, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { label: 'On-time Days', value: summary ? Math.max(0, (summary.present_days || 0) - (summary.late_days || 0)) : '—', icon: CheckCircle2, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
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
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Check In</th>
                                <th className="hidden sm:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Check Out</th>
                                <th className="hidden lg:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Work Hours</th>
                                <th className="px-4 md:px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Status</th>
                                <th className="hidden md:table-cell px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Method</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.025]">
                            {loading ? Array(5).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    {Array(6).fill(0).map((_, j) => <td key={j} className="px-6 py-4"><div className="h-6 bg-white/[0.04] rounded-lg" /></td>)}
                                </tr>
                            )) : attendance.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4 text-slate-500 uppercase font-black text-xs tracking-widest">
                                            <Calendar className="w-12 h-12 text-slate-800" />
                                            No attendance records for this period
                                        </div>
                                    </td>
                                </tr>
                            ) : attendance.map((rec) => (
                                <tr key={rec.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-4 md:px-6 py-3"><span className="text-xs font-bold text-slate-700">{fmtDate(rec.date)}</span></td>
                                    <td className="px-4 md:px-6 py-3">
                                        <div className="flex items-center gap-2.5">
                                            {rec.photo_urls?.in ? (
                                                <button type="button" onClick={() => setPhotoView({ record: rec, kind: 'in' })}
                                                    title="View check-in photo" aria-label={`Check-in photo on ${fmtDate(rec.date)}`}
                                                    className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 border-emerald-400 bg-black hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                                    <img src={rec.photo_urls.in} alt="" className="w-full h-full object-cover object-top" />
                                                </button>
                                            ) : (
                                                <div className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-slate-200 flex items-center justify-center" title="No check-in photo">
                                                    <Camera className="w-3.5 h-3.5 text-slate-300" />
                                                </div>
                                            )}
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2 text-[10px] md:text-[11px] font-bold text-emerald-600">
                                                    <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500" />
                                                    {fmtTime(rec.check_in)}
                                                </div>
                                                <div className={`sm:hidden flex items-center gap-1.5 text-[9px] font-bold ${rec.check_out ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {rec.check_out && rec.photo_urls?.out && (
                                                        <button type="button" onClick={() => setPhotoView({ record: rec, kind: 'out' })}
                                                            aria-label={`Check-out photo on ${fmtDate(rec.date)}`}
                                                            className="w-7 h-7 shrink-0 rounded-md overflow-hidden border-2 border-amber-400 bg-black">
                                                            <img src={rec.photo_urls.out} alt="" className="w-full h-full object-cover object-top" />
                                                        </button>
                                                    )}
                                                    {rec.check_out ? `Out: ${fmtTime(rec.check_out)}` : 'In Session'}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden sm:table-cell px-6 py-3">
                                        <div className="flex items-center gap-2.5">
                                            {rec.photo_urls?.out ? (
                                                <button type="button" onClick={() => setPhotoView({ record: rec, kind: 'out' })}
                                                    title="View check-out photo" aria-label={`Check-out photo on ${fmtDate(rec.date)}`}
                                                    className="w-12 h-12 shrink-0 rounded-lg overflow-hidden border-2 border-amber-400 bg-black hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                                                    <img src={rec.photo_urls.out} alt="" className="w-full h-full object-cover object-top" />
                                                </button>
                                            ) : (
                                                <div className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-slate-200 flex items-center justify-center" title={rec.check_out ? 'No check-out photo' : 'Not checked out'}>
                                                    <Camera className="w-3.5 h-3.5 text-slate-300" />
                                                </div>
                                            )}
                                            <div className={`flex items-center gap-2 text-[11px] font-bold ${rec.check_out ? 'text-slate-600' : 'text-slate-300'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${rec.check_out ? 'bg-amber-500' : 'bg-slate-200'}`} />{fmtTime(rec.check_out)}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="hidden lg:table-cell px-6 py-4 text-center">
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-950 border border-white/[0.05] text-xs font-black text-white">
                                            <Clock className="w-3 h-3 text-slate-600" />{workHoursDisplay(rec)}
                                        </div>
                                    </td>
                                    <td className="px-4 md:px-6 py-4 text-center"><StatusBadge status={rec.status} /></td>
                                    <td className="hidden md:table-cell px-6 py-4 text-center"><MethodBadge method={rec.method} /></td>
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

            {photoView && (
                <AttendancePhotoModal
                    key={`${photoView.record.id}-${photoView.kind}`}
                    record={{ ...photoView.record, employees: photoView.record.employees || employee }}
                    kind={photoView.kind}
                    onClose={() => setPhotoView(null)}
                />
            )}
        </div>
    );
}
