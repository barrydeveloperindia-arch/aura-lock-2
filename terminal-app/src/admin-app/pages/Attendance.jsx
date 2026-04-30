import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Calendar, Clock, Fingerprint, ScanFace,
    ChevronLeft, ChevronRight, Search, FileText,
    Download, Users, UserCheck, AlertTriangle, Loader2,
    CheckCircle2, X, Filter, CalendarDays, MoreVertical, UserX, Briefcase
} from 'lucide-react';
import { apiService } from '../services/api';
import { format, differenceInMinutes, parseISO, startOfWeek, startOfMonth } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

// ── Helper: Blob to Base64 ──────────────────────────────────────────────────
const blobToBase64 = (blob) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const PAGE_SIZE = 10;

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debouncedValue;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    if (status === 'LATE')
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#fffbeb] text-xs font-semibold text-[#d97706]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />Late
            </span>
        );
    if (status === 'ON_TIME')
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#f0fdf4] text-xs font-semibold text-[#16a34a]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />Present
            </span>
        );
    if (status === 'ABSENT')
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#fff1f2] text-xs font-semibold text-[#e11d48]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />Absent
            </span>
        );
    return <span className="text-xs text-slate-400 font-medium">—</span>;
}

// ── Method badge ──────────────────────────────────────────────────────────────
function MethodBadge({ method }) {
    if (!method) return <span className="text-xs text-slate-400 font-medium">--</span>;
    const isFace = method === 'face';
    return (
        <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
            {isFace ? <ScanFace className="w-4 h-4 text-slate-400" /> : <Fingerprint className="w-4 h-4 text-slate-400" />}
            {isFace ? 'Face Scan' : 'Fingerprint'}
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Attendance() {
    const navigate = useNavigate();
    const location = useLocation();
    const [attendance, setAttendance] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [loading, setLoading] = useState(true);

    // Filters
    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [selectedDept, setSelectedDept] = useState('');
    const [searchInput, setSearchInput] = useState('');   // raw (undelayed)
    const [departments, setDepartments] = useState([]);
    const [showFilters, setShowFilters] = useState(false);

    // Debounce the search input
    const searchTerm = useDebounce(searchInput, 300);

    // Pagination + Sorting
    const [page, setPage] = useState(1);
    const [sortCol, setSortCol] = useState('date');
    const [sortDir, setSortDir] = useState('desc');

    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const [stats, setStats] = useState({ total_employees: 0, present_today: 0, late_today: 0, absent_today: 0 });

    useEffect(() => { 
        fetchDepartments();
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const data = await apiService.getDashboardStats();
            setStats(data || { total_employees: 0, present_today: 0, late_today: 0, absent_today: 0 });
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        }
    };

    const fetchDepartments = async () => {
        try {
            const data = await apiService.getDepartments();
            setDepartments(data || []);
        } catch (err) {
            console.error('Failed to fetch departments:', err);
        }
    };

    // Re-fetch whenever any filter / sort / page changes
    useEffect(() => {
        fetchAttendanceData();
    }, [startDate, endDate, selectedDept, searchTerm, page, sortCol, sortDir]);

    // Reset page to 1 when any filter that's not page changes
    useEffect(() => { setPage(1); }, [startDate, endDate, selectedDept, searchTerm]);

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            const result = await apiService.getAttendance({
                startDate, endDate,
                department: selectedDept,
                search: searchTerm,
                page,
                pageSize: PAGE_SIZE,
                sortBy: sortCol,
                sortDir,
            });
            setAttendance(result.data || []);
            setTotalRecords(result.total || 0);
        } catch (err) {
            console.error('Failed to fetch attendance:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const [yr, mo] = startDate.split('-');
            const params = { startDate, endDate, month: mo, year: yr, department: selectedDept, search: searchTerm };
            const blob = await apiService.exportAttendanceExcel(params);
            const filename = `attendance_${startDate}_to_${endDate}.xlsx`;
            
            if (Capacitor.isNativePlatform()) {
                const base64Data = await blobToBase64(blob);
                const savedFile = await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents
                });
                await Share.share({
                    title: 'Attendance Registry',
                    text: 'Exported Attendance Report',
                    url: savedFile.uri,
                    dialogTitle: 'Share or Save Excel File'
                });
            } else {
                const url = window.URL.createObjectURL(new Blob([blob]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed.');
        } finally {
            setExporting(false);
        }
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const [yr, mo] = startDate.split('-');
            const params = { startDate, endDate, month: mo, year: yr, department: selectedDept, search: searchTerm };
            const blob = await apiService.exportAttendancePDF(params);
            const filename = `attendance_${startDate}_to_${endDate}.pdf`;
            
            if (Capacitor.isNativePlatform()) {
                const base64Data = await blobToBase64(blob);
                const savedFile = await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents
                });
                await Share.share({
                    title: 'Attendance Registry',
                    text: 'Exported Attendance Report',
                    url: savedFile.uri,
                    dialogTitle: 'Share or Save PDF File'
                });
            } else {
                const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF export failed.');
        } finally {
            setExportingPdf(false);
        }
    };

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE) || 1;

    return (
        <div className="bg-[#fcfdfd] min-h-screen p-3 md:p-6 font-sans">
            <div className="max-w-[1200px] mx-auto animate-in fade-in duration-500">
                
                {/* ── Top Header ── */}
                <div className="mb-4">
                    <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 tracking-tight">Attendance Register</h1>
                    <p className="text-[11px] md:text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        Office SHIFT 09:00 Am to 6:00 Pm
                    </p>
                </div>

                {/* ── Toolbar Row ── */}
                <div className="flex items-center gap-2 mb-4 w-full">
                    {/* Export Action */}
                    <div className="relative">
                        <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={exporting || exportingPdf} title="Export Options"
                            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-all shadow-sm flex items-center justify-center shrink-0">
                            {exporting || exportingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        </button>
                        {showExportMenu && (
                            <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <button onClick={() => { setShowExportMenu(false); handleExportPdf(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left">
                                    <FileText className="w-4 h-4 text-red-500" /> PDF
                                </button>
                                <button onClick={() => { setShowExportMenu(false); handleExport(); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 text-left border-t border-slate-100">
                                    <FileText className="w-4 h-4 text-green-600" /> Excel
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {/* Search Bar */}
                    <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
                        <Search className="w-5 h-5 text-slate-400 mr-2 shrink-0" />
                        <input 
                            type="text" 
                            placeholder="Search Employee Name" 
                            value={searchInput} 
                            onChange={e => setSearchInput(e.target.value)} 
                            className="w-full bg-transparent outline-none text-sm font-medium text-slate-700 min-w-0" 
                        />
                        {searchInput && (
                            <button onClick={() => setSearchInput('')} className="ml-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                        )}
                    </div>

                    {/* Filter Toggle */}
                    <button 
                        onClick={() => setShowFilters(!showFilters)} 
                        className={`p-2.5 rounded-lg border transition-colors shadow-sm flex items-center justify-center shrink-0
                            ${showFilters ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        <Filter className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Collapsible Filters Panel ── */}
                {showFilters && (
                    <div className="mb-4 p-3 bg-white border border-slate-200 rounded-xl shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50">
                            <CalendarDays className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                            <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setEndDate(e.target.value);}} className="w-full text-xs font-medium text-slate-700 outline-none bg-transparent cursor-pointer" />
                        </div>
                        <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/50">
                            <Briefcase className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                            <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full text-xs font-medium text-slate-700 outline-none bg-transparent appearance-none cursor-pointer">
                                <option value="">All Departments</option>
                                {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* ── Small Stats Row ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4">
                    <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-xl p-2.5 md:p-3 text-center transition-transform hover:scale-105">
                        <div className="text-[9px] md:text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Total</div>
                        <div className="text-lg md:text-xl font-black text-blue-700">{stats.total_employees}</div>
                    </div>
                    <div className="bg-[#f0fdf4] border border-[#dcfce7] rounded-xl p-2.5 md:p-3 text-center transition-transform hover:scale-105">
                        <div className="text-[9px] md:text-[10px] font-bold text-green-500 uppercase tracking-wider mb-0.5">Present</div>
                        <div className="text-lg md:text-xl font-black text-green-700">{stats.present_today}</div>
                    </div>
                    <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-xl p-2.5 md:p-3 text-center transition-transform hover:scale-105">
                        <div className="text-[9px] md:text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Absent</div>
                        <div className="text-lg md:text-xl font-black text-red-700">{stats.absent_today}</div>
                    </div>
                    <div className="bg-[#fffbeb] border border-[#fef3c7] rounded-xl p-2.5 md:p-3 text-center transition-transform hover:scale-105">
                        <div className="text-[9px] md:text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-0.5">Late</div>
                        <div className="text-lg md:text-xl font-black text-orange-700">{stats.late_today}</div>
                    </div>
                </div>

                {/* ── Table Container ── */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap min-w-0">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50">
                                    <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">#</th>
                                    <th className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                                    <th className="hidden md:table-cell px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Department</th>
                                    <th className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Check-in</th>
                                    <th className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Check-out</th>
                                    <th className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            {Array(6).fill(0).map((_, j) => (
                                                <td key={j} className="px-4 py-4"><div className="h-3 bg-slate-100 rounded-full w-full" /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : attendance.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-10 text-center">
                                            <div className="text-sm font-semibold text-slate-400">No records found</div>
                                        </td>
                                    </tr>
                                ) : attendance.map((rec, idx) => {
                                    const indexNum = ((page - 1) * PAGE_SIZE) + idx + 1;
                                    const name = rec.employees?.name || '—';
                                    const empId = rec.employees?.employee_id || '—';
                                    const dept = rec.employees?.department || '—';
                                    const timeIn = rec.check_in ? format(new Date(rec.check_in), 'hh:mm a') : '--';
                                    const timeOut = rec.check_out ? format(new Date(rec.check_out), 'hh:mm a') : '--';
                                    const initials = name.slice(0, 2).toUpperCase();

                                    return (
                                        <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="hidden sm:table-cell px-2 md:px-4 py-3 text-xs font-bold text-slate-600">{indexNum}</td>
                                            <td className="px-2 md:px-4 py-3">
                                                <div 
                                                    onClick={() => navigate(`/admin/attendance/employee/${empId}`)}
                                                    className="flex items-center gap-2 md:gap-3 cursor-pointer group-hover:bg-slate-100 p-1.5 -ml-1.5 rounded-lg transition-colors"
                                                >
                                                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-[9px] md:text-[10px] font-bold text-slate-500 shrink-0">
                                                        {rec.employees?.image_url ? <img src={rec.employees.image_url} alt="" className="w-full h-full object-cover" /> : initials}
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] md:text-sm font-bold text-blue-600 group-hover:text-blue-700 transition-colors">{name}</div>
                                                        <div className="text-[9px] md:text-[10px] font-medium text-slate-500 mt-0.5">{empId}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell px-2 md:px-4 py-3 text-[10px] md:text-xs font-medium text-slate-500">{dept}</td>
                                            <td className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-semibold text-slate-600">{timeIn}</td>
                                            <td className="px-2 md:px-4 py-3 text-[10px] md:text-xs font-semibold text-slate-600">{timeOut}</td>
                                            <td className="px-2 md:px-4 py-3"><StatusBadge status={rec.status} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/30 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[10px] md:text-xs font-medium text-slate-500">
                            Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, totalRecords)} of {totalRecords}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} 
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 transition-colors bg-slate-50">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-[10px] font-bold text-slate-600 px-2">Page {page} of {totalPages}</span>
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} 
                                className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 transition-colors bg-slate-50">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>



            </div>
        </div>
    );
}
