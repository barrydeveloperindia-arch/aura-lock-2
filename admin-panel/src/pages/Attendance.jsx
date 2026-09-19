import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Calendar, Clock, Fingerprint, ScanFace,
    ChevronLeft, ChevronRight, Search, FileText,
    Briefcase, Building2, Download, ArrowUpDown, ArrowUp, ArrowDown,
    Users, UserCheck, Timer, AlertTriangle, Loader2,
    CheckCircle2, X, Filter, Camera
} from 'lucide-react';
import { apiService } from '../services/api';
import AttendancePhotoModal from '../components/AttendancePhotoModal';
import useAvatars from '../hooks/useAvatars';
import { format, differenceInMinutes, parseISO, startOfWeek, startOfMonth } from 'date-fns';

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
const fmtTime = (iso) => iso ? format(new Date(iso), 'HH:mm:ss') : '—';
const fmtDate = (d) => d ? format(new Date(d), 'MMM dd, yyyy') : '—';

const workHoursDisplay = (record) => {
    // Prefer DB-stored working_hours value
    if (record.working_hours != null) {
        const h = Math.floor(record.working_hours);
        const m = Math.round((record.working_hours - h) * 60);
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }
    // Fall back to calculated value
    if (!record.check_in || !record.check_out) return '—';
    const mins = differenceInMinutes(parseISO(record.check_out), parseISO(record.check_in));
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, leaveType }) {
    if (status === 'ABSENT')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-600">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Absent
            </span>
        );
    if (status === 'LEAVE')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-navy/10 border border-brand-navy/20 text-xs font-bold text-brand-navy">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-navy" />{leaveType || 'Leave'}
            </span>
        );
    if (status === 'LATE')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Late
            </span>
        );
    if (status === 'ON_TIME')
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />On Time
            </span>
        );
    return <span className="text-xs text-slate-600 font-bold">—</span>;
}

// ── Method badge ──────────────────────────────────────────────────────────────
function MethodBadge({ method }) {
    const isFace = method === 'face';
    return (
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border
            ${isFace ? 'bg-blue-500/10 border-blue-500/20 text-emerald-600' : 'bg-purple-500/10 border-purple-500/20 text-purple-600'}`}>
            {isFace ? <ScanFace className="w-3 h-3" /> : <Fingerprint className="w-3 h-3" />}
            {method || '—'}
        </div>
    );
}

// ── Sortable header cell ──────────────────────────────────────────────────────
function SortTh({ label, col, sortCol, sortDir, onSort, className = '' }) {
    const active = sortCol === col;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
        <th
            className={`px-6 py-4 text-xs font-bold text-slate-500 cursor-pointer
                        select-none hover:text-slate-500 transition-colors group ${className}`}
            onClick={() => onSort(col)}>
            <div className="flex items-center gap-1.5">
                {label}
                <Icon className={`w-3 h-3 transition-colors ${active ? 'text-emerald-600' : 'text-slate-700 group-hover:text-slate-500'}`} />
            </div>
        </th>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Attendance() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [attendance, setAttendance] = useState([]);
    const [, setEmployees] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [loading, setLoading] = useState(true);

    // Filters
    const today = format(new Date(), 'yyyy-MM-dd');
    const [startDate, setStartDate] = useState(today);
    const [endDate, setEndDate] = useState(today);
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedDept, setSelectedDept] = useState('');
    const [searchInput, setSearchInput] = useState('');   // raw (undelayed)
    // Deep-linked from the Dashboard KPI tiles: /admin/attendance?status=LATE or ?view=absent
    const [selectedStatus, setSelectedStatus] = useState(() => searchParams.get('status') || '');   // '' | 'ON_TIME' | 'LATE'
    const [absentView, setAbsentView] = useState(() => searchParams.get('view') === 'absent');
    const [activePreset, setActivePreset] = useState('today'); // today|week|month|custom
    const [departments, setDepartments] = useState([]);

    // Debounce the search input — only triggers fetch after 300 ms of no typing
    const searchTerm = useDebounce(searchInput, 300);

    // Pagination + Sorting
    const [page, setPage] = useState(1);
    const [sortCol, setSortCol] = useState('date');
    const [sortDir, setSortDir] = useState('desc');

    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    // Photo viewer: { record, kind: 'in' | 'out' } or null
    const [photoView, setPhotoView] = useState(null);

    // Latest-scan face crops, one request per page of rows
    const avatars = useAvatars(attendance.map(r => r.employees?.employee_id));

    useEffect(() => {
        fetchEmployees();
        fetchDepartments();
    }, []);

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
    }, [startDate, endDate, selectedEmployee, selectedDept, searchTerm, selectedStatus, absentView, page, sortCol, sortDir]);

    // Reset page to 1 when any filter that's not page changes
    useEffect(() => { setPage(1); }, [startDate, endDate, selectedEmployee, selectedDept, searchTerm, selectedStatus, absentView]);

    const fetchEmployees = async () => {
        try {
            const data = await apiService.getUsers();
            setEmployees(data || []);
        } catch (err) {
            console.error('Failed to fetch employees:', err);
        }
    };

    const fetchAttendanceData = async () => {
        setLoading(true);
        try {
            const result = await apiService.getAttendance({
                startDate, endDate,
                employee_id: selectedEmployee,
                department: selectedDept,
                search: searchTerm,
                status: absentView ? '' : selectedStatus,
                absent: absentView || undefined,
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

    const handleSort = useCallback((col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortCol(col);
            setSortDir('desc');
        }
        setPage(1);
    }, [sortCol]);

    const handleExport = async () => {
        setExporting(true);
        try {
            const params = {
                startDate,
                endDate,
                employee_id: selectedEmployee,
                department: selectedDept,
                search: searchTerm,
                status: selectedStatus
            };
            const blob = await apiService.exportAttendanceExcel(params);
            const filename = `attendance_${startDate}_to_${endDate}.xlsx`;
            const url = window.URL.createObjectURL(new Blob([blob]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const params = {
                startDate,
                endDate,
                employee_id: selectedEmployee,
                department: selectedDept,
                search: searchTerm,
                status: selectedStatus
            };
            const blob = await apiService.exportAttendancePDF(params);
            const filename = `attendance_${startDate}_to_${endDate}.pdf`;
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF export failed. Please try again.');
        } finally {
            setExportingPdf(false);
        }
    };

    const resetFilters = () => {
        const t = format(new Date(), 'yyyy-MM-dd');
        setStartDate(t); setEndDate(t);
        setSelectedEmployee(''); setSelectedDept('');
        setSearchInput(''); setSelectedStatus('');
        setActivePreset('today');
        setPage(1); setSortCol('date'); setSortDir('desc');
    };

    // ── Quick date presets ────────────────────────────────────────────────────
    const applyPreset = (preset) => {
        const now = new Date();
        const t = format(now, 'yyyy-MM-dd');
        setActivePreset(preset);
        setPage(1);
        if (preset === 'today') { setStartDate(t); setEndDate(t); }
        if (preset === 'week') { setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')); setEndDate(t); }
        if (preset === 'month') { setStartDate(format(startOfMonth(now), 'yyyy-MM-dd')); setEndDate(t); }
        // 'custom' — user types dates manually
    };

    const hasActiveFilter = selectedEmployee || selectedDept || selectedStatus || searchInput
        || startDate !== format(new Date(), 'yyyy-MM-dd') || endDate !== format(new Date(), 'yyyy-MM-dd');

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    const presentCount = attendance.filter(r => r.check_in).length;
    const lateCount = attendance.filter(r => r.status === 'LATE').length;
    const _checkedOut = attendance.filter(r => r.check_out).length;
    const onTimeCount = attendance.filter(r => r.status === 'ON_TIME').length;

    const inputCls = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors';
    const selCls = `${inputCls} appearance-none cursor-pointer`;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2 tracking-tight">
                        {absentView ? 'Absent Today' : 'Attendance Registry'}
                    </h1>
                    <p className="text-slate-500 text-xs md:text-sm font-medium flex items-center gap-2 flex-wrap">
                        {absentView ? 'Not checked in' : 'Verified presence'} &middot; <span className="font-semibold text-slate-900">{totalRecords}</span> records
                        {absentView && (
                            <button onClick={() => setAbsentView(false)}
                                className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                                <X className="w-3 h-3" /> Clear
                            </button>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleExportPdf} disabled={exportingPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed border border-slate-300 rounded-lg text-slate-700 text-sm font-medium shadow-sm transition-colors">
                        {exportingPdf
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                            : <><FileText className="w-4 h-4" /> Export PDF</>}
                    </button>
                    <button onClick={handleExport} disabled={exporting}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-white text-sm font-medium shadow-sm transition-colors">
                        {exporting
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                            : <><Download className="w-4 h-4" /> Export Excel</>}
                    </button>
                </div>
            </div>

            {/* ── Summary Stat Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total records', value: totalRecords, icon: Users, color: 'bg-blue-50 text-blue-600' },
                    { label: 'Checked in (this page)', value: presentCount, icon: UserCheck, color: 'bg-emerald-50 text-emerald-600' },
                    { label: 'On time (this page)', value: onTimeCount, icon: CheckCircle2, color: 'bg-teal-50 text-teal-600' },
                    { label: 'Late (this page)', value: lateCount, icon: AlertTriangle, color: 'bg-amber-50 text-amber-700' },
                ].map(s => (
                    <div key={s.label} className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center gap-3 cursor-pointer transition-shadow hover:shadow-md"
                        onClick={() => { setSelectedStatus(s.label.startsWith('Late') ? 'LATE' : s.label.startsWith('On time') ? 'ON_TIME' : ''); setPage(1); }}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.color}`}>
                            <s.icon className="w-4 h-4" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold tabular-nums text-slate-900 leading-none">{loading ? '—' : s.value}</div>
                            <div className="text-xs font-medium text-slate-500 mt-1">{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Filter Bar ── */}
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">

                {/* Quick Date Presets */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-600 mr-1">Quick range:</span>
                    {[['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'], ['custom', 'Custom']].map(([key, label]) => (
                        <button key={key} onClick={() => applyPreset(key)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border
                                ${activePreset === key
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                    : 'bg-white border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Filters grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">

                    {/* Date Range */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-semibold text-slate-600">Date Range</label>
                        <div className="flex items-center gap-2">
                            <input type="date" value={startDate} max={endDate}
                                onChange={e => { setStartDate(e.target.value); setActivePreset('custom'); setPage(1); }}
                                className={inputCls} />
                            <span className="text-slate-700 shrink-0">–</span>
                            <input type="date" value={endDate} min={startDate}
                                onChange={e => { setEndDate(e.target.value); setActivePreset('custom'); setPage(1); }}
                                className={inputCls} />
                        </div>
                    </div>

                    {/* Search */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Search Name</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
                            <input type="text" placeholder="Type to search…"
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                className={`${inputCls} pl-9`} />
                        </div>
                    </div>

                    {/* Department */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Department</label>
                        <select value={selectedDept}
                            onChange={e => { setSelectedDept(e.target.value); setPage(1); }}
                            className={selCls}>
                            <option value="">All Departments</option>
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Status</label>
                        <select value={selectedStatus}
                            onChange={e => { setSelectedStatus(e.target.value); setPage(1); }}
                            className={selCls}>
                            <option value="">All Status</option>
                            <option value="ON_TIME">On Time</option>
                            <option value="LATE">Late</option>
                        </select>
                    </div>

                    {/* Reset */}
                    <div className="flex items-end">
                        <button onClick={resetFilters}
                            className={`w-full py-2 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5
                                ${hasActiveFilter
                                    ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'}`}
                            disabled={!hasActiveFilter}>
                            <X className="w-3 h-3" /> Reset All
                        </button>
                    </div>
                </div>

                {/* Active filter chips */}
                {hasActiveFilter && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {searchInput && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold">
                                Name: "{searchInput}"
                                <button onClick={() => setSearchInput('')}><X className="w-2.5 h-2.5" /></button>
                            </span>)}
                        {selectedDept && (
                            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 border border-violet-200 text-violet-700 rounded-lg text-xs font-semibold">
                                Dept: {selectedDept}
                                <button onClick={() => setSelectedDept('')}><X className="w-2.5 h-2.5" /></button>
                            </span>)}
                        {selectedStatus && (
                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border
                                ${selectedStatus === 'LATE'
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                Status: {selectedStatus === 'LATE' ? 'Late' : 'On time'}
                                <button onClick={() => setSelectedStatus('')}><X className="w-2.5 h-2.5" /></button>
                            </span>)}
                    </div>
                )}
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="px-4 md:px-6 py-4 text-xs font-semibold text-slate-600">Sr. No.</th>
                                <th className="px-4 md:px-6 py-4 text-xs font-semibold text-slate-600">Employee</th>
                                <th className="hidden xl:table-cell px-6 py-4 text-xs font-semibold text-slate-600">Company</th>
                                <th className="hidden lg:table-cell px-6 py-4 text-xs font-semibold text-slate-600">Department</th>
                                <SortTh label="Date" col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />
                                <th className="px-4 md:px-6 py-4 text-xs font-semibold text-slate-600">Check In</th>
                                <th className="hidden sm:table-cell px-6 py-4 text-xs font-semibold text-slate-600">Check Out</th>
                                <SortTh label="Work Hours" col="working_hours" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center hidden xl:table-cell" />
                                <th className="px-4 md:px-6 py-4 text-xs font-semibold text-slate-600 text-center">Status</th>
                                <th className="hidden md:table-cell px-6 py-4 text-xs font-semibold text-slate-600 text-center">Method</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {Array(9).fill(0).map((_, j) => (
                                            <td key={j} className="px-6 py-4">
                                                <div className="h-6 bg-slate-100 rounded-lg" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : attendance.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <Calendar className="w-12 h-12 text-slate-800" />
                                            <div className="text-slate-500 text-xs font-bold">
                                                No records match the selected filters
                                            </div>
                                            <button onClick={resetFilters}
                                                className="text-xs text-emerald-600 hover:underline font-bold">
                                                Clear filters
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : attendance.map((rec, idx) => {
                                const name = rec.employees?.name || '—';
                                const initials = name.slice(0, 2).toUpperCase();
                                return (
                                    <tr key={rec.id} 
                                        className="group hover:bg-slate-50 cursor-pointer transition-all border-l-2 border-l-transparent hover:border-l-blue-500"
                                        onClick={() => navigate(`/admin/attendance/employee/${rec.employees?.employee_id || rec.employee_id}`)}>
                                        {/* Sr. No. */}
                                        <td className="px-4 md:px-6 py-4 text-xs font-bold text-slate-500 tabular-nums">
                                            {(page - 1) * PAGE_SIZE + idx + 1}
                                        </td>
                                        {/* Employee */}
                                        <td className="px-4 md:px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 overflow-hidden">
                                                    {(avatars[rec.employees?.employee_id] || rec.employees?.image_url)
                                                        ? <img src={avatars[rec.employees?.employee_id] || rec.employees.image_url} alt="" className="w-full h-full object-cover" />
                                                        : initials}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-600 transition-colors whitespace-nowrap truncate">
                                                        {name}
                                                    </div>
                                                    <div className="text-xs md:text-xs font-mono text-slate-500 truncate">
                                                        {rec.employees?.employee_id || '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Company */}
                                        <td className="hidden xl:table-cell px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-3 h-3 text-slate-600 shrink-0" />
                                                <span className="text-sm text-slate-700 whitespace-nowrap">
                                                    {rec.employees?.company || 'Englabs India Pvt Ltd'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Department */}
                                        <td className="hidden lg:table-cell px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <Briefcase className="w-3 h-3 text-slate-600 shrink-0" />
                                                <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                                                    {rec.employees?.department || 'General'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Date */}
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            <span className="text-sm text-slate-700 tabular-nums whitespace-nowrap">
                                                {fmtDate(rec.date)}
                                            </span>
                                        </td>

                                        {/* Check In: stamped frame + time */}
                                        <td className="px-4 md:px-6 py-3">
                                            <div className="flex items-center gap-2.5">
                                                {rec.photo_urls?.in ? (
                                                    <button type="button"
                                                        onClick={(e) => { e.stopPropagation(); setPhotoView({ record: rec, kind: 'in' }); }}
                                                        title="View check-in photo" aria-label={`Check-in photo of ${name}`}
                                                        className="w-11 h-11 shrink-0 rounded-lg overflow-hidden border-2 border-emerald-400 bg-black hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                                                        <img src={rec.photo_urls.in} alt="" className="w-full h-full object-cover object-top" />
                                                    </button>
                                                ) : (
                                                    <div className="w-11 h-11 shrink-0 rounded-lg border border-dashed border-slate-200 flex items-center justify-center" title="No check-in photo">
                                                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                                                    </div>
                                                )}
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 text-xs md:text-xs font-bold text-emerald-600 tabular-nums">
                                                        <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                        {fmtTime(rec.check_in)}
                                                    </div>
                                                    {/* Phones hide the Check Out column: show OUT here instead */}
                                                    {rec.check_out && (
                                                        <div className="sm:hidden flex items-center gap-1.5 text-xs font-bold text-slate-500 tabular-nums">
                                                            {rec.photo_urls?.out ? (
                                                                <button type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setPhotoView({ record: rec, kind: 'out' }); }}
                                                                    aria-label={`Check-out photo of ${name}`}
                                                                    className="w-7 h-7 shrink-0 rounded-md overflow-hidden border-2 border-amber-400 bg-black">
                                                                    <img src={rec.photo_urls.out} alt="" className="w-full h-full object-cover object-top" />
                                                                </button>
                                                            ) : <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                                                            Out {fmtTime(rec.check_out)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Check Out: stamped frame + time */}
                                        <td className="hidden sm:table-cell px-6 py-3">
                                            <div className="flex items-center gap-2.5">
                                                {rec.photo_urls?.out ? (
                                                    <button type="button"
                                                        onClick={(e) => { e.stopPropagation(); setPhotoView({ record: rec, kind: 'out' }); }}
                                                        title="View check-out photo" aria-label={`Check-out photo of ${name}`}
                                                        className="w-11 h-11 shrink-0 rounded-lg overflow-hidden border-2 border-amber-400 bg-black hover:scale-105 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                                                        <img src={rec.photo_urls.out} alt="" className="w-full h-full object-cover object-top" />
                                                    </button>
                                                ) : (
                                                    <div className="w-11 h-11 shrink-0 rounded-lg border border-dashed border-slate-200 flex items-center justify-center" title={rec.check_out ? 'No check-out photo' : 'Not checked out yet'}>
                                                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                                                    </div>
                                                )}
                                                <div className={`flex items-center gap-2 text-xs font-bold tabular-nums
                                                    ${rec.check_out ? 'text-slate-600' : 'text-slate-500'}`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${rec.check_out ? 'bg-amber-500' : 'bg-slate-200'}`} />
                                                    {fmtTime(rec.check_out)}
                                                </div>
                                            </div>
                                        </td>

                                        {/* Working Hours */}
                                        <td className="hidden xl:table-cell px-6 py-4 text-center">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-bold text-slate-900 tabular-nums">
                                                <Clock className="w-3 h-3 text-slate-600" />
                                                {workHoursDisplay(rec)}
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 md:px-6 py-4 text-center">
                                            <StatusBadge status={rec.status} leaveType={rec.leave_type} />
                                        </td>

                                        {/* Method */}
                                        <td className="hidden md:table-cell px-6 py-4 text-center">
                                            <MethodBadge method={rec.method} />
                                        </td>

                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Pagination ── */}
                <div className="px-8 py-5 border-t border-slate-200 flex items-center justify-between gap-4">
                    <p className="text-xs font-bold text-slate-500">
                        Showing&nbsp;
                        <span className="text-slate-900">{((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalRecords)}</span>
                        &nbsp;of&nbsp;
                        <span className="text-slate-900">{totalRecords}</span>
                        &nbsp;records
                    </p>

                    <div className="flex items-center gap-2">
                        <button disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-20 transition-all">
                            <ChevronLeft className="w-4 h-4" />
                        </button>

                        {/* Page number pills */}
                        {Array.from({ length: Math.min(5, totalPages || 1) }, (_, i) => {
                            // Sliding window: show pages around current
                            const start = Math.max(1, Math.min(page - 2, (totalPages || 1) - 4));
                            const p = start + i;
                            if (p > (totalPages || 1)) return null;
                            return (
                                <button key={p} onClick={() => setPage(p)}
                                    className={`w-8 h-8 rounded-xl text-xs font-bold transition-all
                                        ${p === page
                                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                            : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'}`}>
                                    {p}
                                </button>
                            );
                        })}

                        <button disabled={page >= (totalPages || 1)}
                            onClick={() => setPage(p => p + 1)}
                            className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 disabled:opacity-20 transition-all">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {photoView && (
                <AttendancePhotoModal
                    key={`${photoView.record.id}-${photoView.kind}`}
                    record={photoView.record}
                    kind={photoView.kind}
                    onClose={() => setPhotoView(null)}
                />
            )}
        </div>
    );
}
