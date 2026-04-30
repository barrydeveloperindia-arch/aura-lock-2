import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Calendar, Fingerprint, ScanFace,
    ChevronLeft, ChevronRight, FileText,
    Download, ArrowLeft, Mail, Filter,
    CheckCircle, XCircle, Clock, FileDown,
    ChevronDown, ChevronUp
} from 'lucide-react';
import { apiService } from '../services/api';
import { format, startOfWeek, startOfMonth, subDays } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

const PAGE_SIZE = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────
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

const fmtTime = (iso) => iso ? format(new Date(iso), 'hh:mm a') : '—';
const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
const fmtDay = (d) => d ? format(new Date(d), 'EEE') : '—';

const calculateWorkMins = (record) => {
    if (record.working_hours != null) return record.working_hours * 60;
    if (record.check_in && record.check_out) {
        return (new Date(record.check_out) - new Date(record.check_in)) / 60000;
    }
    return 0;
};

const workHoursDisplay = (record) => {
    const mins = calculateWorkMins(record);
    if (mins === 0) return '0 hr';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (m === 0) return `${h} hr`;
    if (h === 0) return `${m} min`;
    return `${h} hr ${m} min`;
};

const overtimeDisplay = (record) => {
    const mins = calculateWorkMins(record);
    if (mins > 540) { // 9 hours = 540 mins
        const ot = mins - 540;
        const h = Math.floor(ot / 60);
        const m = Math.round(ot % 60);
        if (m === 0) return `${h} hr`;
        if (h === 0) return `${m} min`;
        return `${h} hr ${m} min`;
    }
    return '0';
};

function StatusBadge({ status, checkIn }) {
    if (!checkIn) {
        return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-red-100 text-xs font-semibold text-red-600 min-w-[70px]">
                Absent
            </span>
        );
    }
    if (status === 'LATE') {
        return (
            <span className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-orange-100 text-xs font-semibold text-orange-500">
                Late Present
            </span>
        );
    }
    return (
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-md bg-emerald-100 text-xs font-semibold text-emerald-600 min-w-[70px]">
            Present
        </span>
    );
}

function MethodBadge({ method }) {
    if (!method) return <span className="text-slate-400">—</span>;
    const isFace = method === 'face';
    return (
        <div className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            {isFace ? <ScanFace className="w-4 h-4 text-slate-400" /> : <Fingerprint className="w-4 h-4 text-slate-400" />}
            {isFace ? 'Face Scan' : 'Fingerprint'}
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
    const [activeRange, setActiveRange] = useState('Custom Range');
    const [page, setPage] = useState(1);

    const [exporting, setExporting] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);
    const [isFiltersOpen, setIsFiltersOpen] = useState(false);

    useEffect(() => {
        fetchData();
        fetchSummary();
    }, [employee_id, page]); // Re-fetch on page change

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

    const handleApplyFilters = () => {
        setPage(1);
        fetchData();
        fetchSummary();
    };

    const handleRangeChange = (val) => {
        setActiveRange(val);
        const now = new Date();
        const t = format(now, 'yyyy-MM-dd');
        if (val === 'Today') { setStartDate(t); setEndDate(t); }
        else if (val === 'This Week') { setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')); setEndDate(t); }
        else if (val === 'This Month') { 
            setStartDate(format(startOfMonth(now), 'yyyy-MM-dd')); 
            setEndDate(t); 
        }
    };

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const params = { startDate, endDate };
            const blob = await apiService.exportEmployeeAttendanceExcel(employee_id, params);
            const filename = `attendance_${employee?.employee_id || employee_id}_${startDate}_to_${endDate}.xlsx`;
            
            if (Capacitor.isNativePlatform()) {
                const base64Data = await blobToBase64(blob);
                const savedFile = await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents
                });
                await Share.share({
                    title: 'Employee Attendance',
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
            alert('Excel Export failed. Please check logs.');
        }
        finally { setExporting(false); }
    };

    const handleExportPdf = async () => {
        setExportingPdf(true);
        try {
            const params = { startDate, endDate };
            const blob = await apiService.exportEmployeeAttendancePDF(employee_id, params);
            const filename = `attendance_${employee?.employee_id || employee_id}_${startDate}_to_${endDate}.pdf`;
            
            if (Capacitor.isNativePlatform()) {
                const base64Data = await blobToBase64(blob);
                const savedFile = await Filesystem.writeFile({
                    path: filename,
                    data: base64Data,
                    directory: Directory.Documents
                });
                await Share.share({
                    title: 'Employee Attendance',
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
            alert('PDF Export failed. Please check logs.');
        }
        finally { setExportingPdf(false); }
    };

    const totalPages = Math.ceil(totalRecords / PAGE_SIZE);
    
    // Percentage calculations
    const totalDays = summary?.total_days || 0;
    const presentPerc = totalDays ? Math.round(((summary?.present_days || 0) / totalDays) * 100) : 0;
    const absentPerc = totalDays ? Math.round(((totalDays - (summary?.present_days || 0)) / totalDays) * 100) : 0;
    const latePerc = totalDays ? Math.round(((summary?.late_days || 0) / totalDays) * 100) : 0;
    const absentCount = totalDays - (summary?.present_days || 0);

    return (
        <div className="bg-transparent text-slate-800 animate-in fade-in duration-500 font-sans w-full max-w-[100vw] min-w-0">
            <div className="w-full max-w-full sm:max-w-6xl mx-auto space-y-3 md:space-y-6 pb-6">
                
                {/* ── Header ── */}
                <div className="flex items-start gap-3 md:gap-4">
                    <button onClick={() => navigate(-1)} className="mt-0.5 md:mt-1 p-1.5 md:p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-2xl font-bold text-slate-900 truncate">Employee Attendance Export</h1>
                        <p className="text-xs md:text-sm text-slate-500 mt-0.5">View, filter and export attendance</p>
                    </div>
                </div>

                {/* ── Profile Card ── */}
                <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-6 shadow-sm border border-slate-100 flex items-center justify-between gap-3 md:gap-6">
                    <div className="flex items-center gap-3 md:gap-5">
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center text-lg md:text-xl font-bold text-slate-500 shrink-0">
                            {employee?.image_url ? <img src={employee.image_url} alt="" className="w-full h-full object-cover" /> : employee?.name?.slice(0,2).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3">
                                <h2 className="text-base md:text-lg font-bold text-slate-900 leading-tight">{employee?.name || 'Loading...'}</h2>
                                <span className="w-fit px-1.5 md:px-2 py-0.5 rounded bg-emerald-100 text-[9px] md:text-[10px] font-bold text-emerald-600">
                                    {employee?.employee_id}
                                </span>
                            </div>
                            <p className="text-[11px] md:text-sm text-slate-500 mt-0.5">
                                {employee?.department || 'IT Department'} <span className="hidden md:inline">• Software Developer</span>
                            </p>
                        </div>
                    </div>
                    <div className="hidden md:flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50">
                        <Calendar className="w-5 h-5 text-slate-400" />
                        <div>
                            <div className="text-[10px] font-bold text-slate-400">Join Date</div>
                            <div className="text-sm font-semibold text-slate-700">12 Jan 2024</div>
                        </div>
                    </div>
                </div>

                {/* ── Summary Stats ── */}
                <div className="bg-white rounded-xl md:rounded-2xl p-2 md:p-4 shadow-sm border border-slate-100 flex items-center justify-between divide-x divide-slate-100">
                    <div className="flex flex-col items-center flex-1 px-1 md:px-0">
                        <div className="flex items-center gap-1 mb-0.5 md:mb-1">
                            <CheckCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-500" />
                            <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Present</span>
                        </div>
                        <div className="text-base md:text-2xl font-bold text-slate-800">{summary?.present_days || 0}</div>
                    </div>
                    
                    <div className="flex flex-col items-center flex-1 px-1 md:px-0">
                        <div className="flex items-center gap-1 mb-0.5 md:mb-1">
                            <XCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-red-500" />
                            <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Absent</span>
                        </div>
                        <div className="text-base md:text-2xl font-bold text-slate-800">{absentCount}</div>
                    </div>

                    <div className="flex flex-col items-center flex-1 px-1 md:px-0">
                        <div className="flex items-center gap-1 mb-0.5 md:mb-1">
                            <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 text-orange-500" />
                            <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Late</span>
                        </div>
                        <div className="text-base md:text-2xl font-bold text-slate-800">{summary?.late_days || 0}</div>
                    </div>

                    <div className="flex flex-col items-center flex-1 px-1 md:px-0">
                        <div className="flex items-center gap-1 mb-0.5 md:mb-1">
                            <Calendar className="w-3 h-3 md:w-3.5 md:h-3.5 text-blue-500" />
                            <span className="text-[9px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">Total</span>
                        </div>
                        <div className="text-base md:text-2xl font-bold text-slate-800">{totalDays}</div>
                    </div>
                </div>

                {/* ── Filters ── */}
                <div className="bg-white rounded-xl md:rounded-2xl p-3 md:p-5 shadow-sm border border-slate-100 flex flex-col gap-3 transition-all duration-300">
                    <div 
                        className="flex items-center justify-between cursor-pointer md:cursor-default select-none"
                        onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                    >
                        <div className="flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-700">
                            <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" /> 
                            <span>Filters <span className="md:hidden font-normal text-slate-400 ml-1">({activeRange})</span></span>
                        </div>
                        <div className="md:hidden text-slate-400 p-1 hover:bg-slate-50 rounded-md">
                            {isFiltersOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                    </div>
                    <div className={`${isFiltersOpen ? 'grid' : 'hidden md:flex'} grid-cols-1 sm:grid-cols-2 md:grid-cols-none md:flex md:items-end gap-3 md:gap-4 transition-all duration-300`}>
                        <div className="flex flex-col gap-1 md:flex-1">
                            <label className="text-[10px] md:text-xs font-semibold text-slate-500">Range</label>
                            <select value={activeRange} onChange={e => handleRangeChange(e.target.value)} 
                                className="w-full bg-white border border-slate-200 rounded px-2 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500">
                                <option>Custom</option>
                                <option>Today</option>
                                <option>This Week</option>
                                <option>This Month</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1 md:flex-1">
                            <label className="text-[10px] md:text-xs font-semibold text-slate-500">From</label>
                            <input type="date" value={startDate} onChange={e => {setStartDate(e.target.value); setActiveRange('Custom Range');}} 
                                className="w-full bg-white border border-slate-200 rounded px-2 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500" />
                        </div>
                        <div className="flex flex-col gap-1 md:flex-1">
                            <label className="text-[10px] md:text-xs font-semibold text-slate-500">To</label>
                            <input type="date" value={endDate} onChange={e => {setEndDate(e.target.value); setActiveRange('Custom Range');}} 
                                className="w-full bg-white border border-slate-200 rounded px-2 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500" />
                        </div>
                        <div className="flex flex-col gap-1 md:flex-1">
                            <label className="text-[10px] md:text-xs font-semibold text-slate-500">Status</label>
                            <select className="w-full bg-white border border-slate-200 rounded px-2 py-2 text-xs text-slate-700 outline-none focus:border-emerald-500">
                                <option>All</option>
                                <option>Present</option>
                                <option>Late</option>
                                <option>Absent</option>
                            </select>
                        </div>
                        <button onClick={handleApplyFilters}
                            className="col-span-1 sm:col-span-2 md:col-span-1 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-[11px] md:text-sm px-3 py-2 rounded transition-colors flex items-center justify-center gap-1 mt-1 md:mt-0 shadow-sm">
                            Apply
                        </button>
                    </div>
                </div>

                {/* ── Table Area ── */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden w-full max-w-full relative">
                    <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
                        <h3 className="font-bold text-slate-800 text-sm md:text-base">ATTENDANCE RECORDS V2</h3>
                        <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-3">
                            <button onClick={handleExportExcel} disabled={exporting}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-lg text-xs font-bold transition-colors">
                                {exporting ? <Clock className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} <span className="truncate">Export CSV</span>
                            </button>
                            <button onClick={handleExportPdf} disabled={exportingPdf}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition-colors">
                                {exportingPdf ? <Clock className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} <span className="truncate">Save PDF</span>
                            </button>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 border-b border-slate-100 px-4 py-2 md:hidden flex items-center justify-between">
                        <button onClick={() => {
                            const container = document.getElementById('attendance-table-container');
                            if(container) container.scrollBy({ left: -150, behavior: 'smooth' });
                        }} className="p-1.5 text-slate-500 bg-white rounded-md border border-slate-200 shadow-sm active:bg-slate-100 touch-manipulation">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scroll Table</span>
                        <button onClick={() => {
                            const container = document.getElementById('attendance-table-container');
                            if(container) container.scrollBy({ left: 150, behavior: 'smooth' });
                        }} className="p-1.5 text-slate-500 bg-white rounded-md border border-slate-200 shadow-sm active:bg-slate-100 touch-manipulation">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <div id="attendance-table-container" className="w-full max-w-[100vw] sm:max-w-full overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                        <table className="w-full text-left whitespace-nowrap">
                            <thead>
                                <tr className="bg-slate-50/80 border-b border-slate-100">
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">#</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600 sticky left-0 bg-slate-50/80 z-10 drop-shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Date</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Day</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Check In</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Check Out</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Day Status</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Overtime</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Total Hours</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Method</th>
                                    <th className="px-5 py-3 text-xs font-bold text-slate-600">Remarks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {Array(10).fill(0).map((_, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded" /></td>)}
                                    </tr>
                                )) : attendance.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500 font-medium">
                                            No attendance records found.
                                        </td>
                                    </tr>
                                ) : attendance.map((rec, idx) => {
                                    const indexNum = ((page - 1) * PAGE_SIZE) + idx + 1;
                                    return (
                                        <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3.5 text-xs font-medium text-slate-600">{indexNum}</td>
                                            <td className="px-5 py-3.5 text-xs text-slate-700 sticky left-0 bg-white group-hover:bg-slate-50 transition-colors z-10 drop-shadow-[2px_0_5px_rgba(0,0,0,0.05)]">{fmtDate(rec.date)}</td>
                                            <td className="px-5 py-3.5 text-xs text-slate-500">{fmtDay(rec.date)}</td>
                                            <td className="px-5 py-3.5 text-xs font-medium text-slate-700">{fmtTime(rec.check_in)}</td>
                                            <td className="px-5 py-3.5 text-xs font-medium text-slate-700">{fmtTime(rec.check_out)}</td>
                                            <td className="px-5 py-3.5"><StatusBadge status={rec.status} checkIn={rec.check_in} /></td>
                                            <td className="px-5 py-3.5 text-xs font-semibold text-orange-600">{overtimeDisplay(rec)}</td>
                                            <td className="px-5 py-3.5 text-xs font-semibold text-slate-600">{workHoursDisplay(rec)}</td>
                                            <td className="px-5 py-3.5"><MethodBadge method={rec.method} /></td>
                                            <td className="px-5 py-3.5 text-xs text-slate-400">—</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-xs font-medium text-slate-500">
                            Showing {attendance.length > 0 ? ((page - 1) * PAGE_SIZE) + 1 : 0} to {Math.min(page * PAGE_SIZE, totalRecords)} of {totalRecords} records
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                            <button className="w-7 h-7 rounded bg-emerald-500 text-white text-xs font-bold">{page}</button>
                            <button disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
