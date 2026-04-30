import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    LineChart, Line, Legend
} from 'recharts';
import {
    Download, FileText, TrendingUp, Clock,
    Calendar, CheckCircle, AlertTriangle, Timer,
    Briefcase, User
} from 'lucide-react';
import { format, getMonth, getYear } from 'date-fns';

export default function Reports() {
    const navigate = useNavigate();
    const [reportData, setReportData] = useState([]);
    const [monthlyReport, setMonthlyReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    // Monthly Selectors
    const [selectedMonth, setSelectedMonth] = useState(getMonth(new Date()) + 1);
    const [selectedYear, setSelectedYear] = useState(getYear(new Date()));

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const years = [2024, 2025, 2026];

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const data = await apiService.getAttendanceReport();
            setReportData(data);
            await fetchMonthlyReport();
        } catch (err) {
            console.error("Failed to fetch reports:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMonthlyReport = async () => {
        setGenerating(true);
        try {
            const data = await apiService.getMonthlyReport(selectedMonth, selectedYear);
            setMonthlyReport(data);
        } catch (err) {
            console.error("Failed to generate monthly report:", err);
        } finally {
            setGenerating(false);
        }
    };

    const totalScans = reportData.reduce((acc, curr) => acc + curr.present, 0);

    const handleExportCSV = () => {
        if (!monthlyReport || !monthlyReport.data || monthlyReport.data.length === 0) return;
        
        const headers = ['Employee Name', 'Employee ID', 'Department', 'Working Days', 'Present', 'Absent', 'Late', 'Total Hours', 'Total Overtime'];
        const csvRows = [headers.join(',')];
        
        monthlyReport.data.forEach(row => {
            csvRows.push([
                `"${row.name}"`, 
                row.employee_id, 
                `"${row.department}"`,
                monthlyReport.workingDaysInMonth,
                row.presentDays,
                row.absentDays,
                row.lateDays,
                row.totalWorkHours,
                row.totalOvertime
            ].join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `monthly_attendance_${months[selectedMonth - 1]}_${selectedYear}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full max-w-[100vw] min-w-0 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter uppercase">Attendance Analytics</h1>
                    <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Data Insights // Performance Audit</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <button onClick={handleExportCSV} className="flex-1 md:flex-none px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 shadow-sm rounded-xl text-slate-700 text-[10px] md:text-xs font-black transition-all flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button onClick={() => navigate('/admin/logs')} className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 rounded-xl text-white text-[10px] md:text-xs font-black transition-all flex items-center justify-center gap-2">
                        <FileText className="w-4 h-4" /> Audit Log
                    </button>
                </div>
            </div>

            {/* Visual Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Daily Trend */}
                <div className="card p-8 bg-white border border-slate-200 shadow-sm rounded-3xl">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Presence Volume</h2>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">7-Day Rolling Activity</p>
                        </div>
                        <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-500">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="h-[200px] md:h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={reportData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#64748b"
                                    fontSize={9}
                                    tickFormatter={(str) => format(new Date(str), 'MM/dd')}
                                />
                                <YAxis stroke="#64748b" fontSize={9} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', color: '#0f172a' }}
                                    itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="present" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
                                <Bar dataKey="late" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={16} />
                                <Bar dataKey="absent" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Efficiency Chart */}
                <div className="card p-8 bg-white border border-slate-200 shadow-sm rounded-3xl">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Punctuality Score</h2>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Consistency Metrics</p>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-500">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="h-[200px] md:h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={reportData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#64748b"
                                    fontSize={9}
                                    tickFormatter={(str) => format(new Date(str), 'MM/dd')}
                                />
                                <YAxis stroke="#64748b" fontSize={9} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', color: '#0f172a' }}
                                />
                                <Line type="monotone" dataKey="late" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Monthly Reporting System */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Monthly Report Generation</h2>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Personnel Aggregation // {months[selectedMonth - 1]} {selectedYear}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 p-2 bg-white border border-slate-200 shadow-sm rounded-2xl">
                        <div className="flex items-center flex-1 md:flex-none">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="bg-transparent text-[10px] md:text-xs font-black text-slate-700 uppercase tracking-widest px-3 md:px-4 py-2 focus:outline-none cursor-pointer flex-1"
                            >
                                {months.map((m, i) => (
                                    <option key={i} value={i + 1} className="bg-white text-slate-800">{m}</option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="bg-transparent text-[10px] md:text-xs font-black text-slate-700 uppercase tracking-widest px-3 md:px-4 py-2 border-l border-slate-200 focus:outline-none cursor-pointer"
                            >
                                {years.map(y => (
                                    <option key={y} value={y} className="bg-white text-slate-800">{y}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={fetchMonthlyReport}
                            disabled={generating}
                            className={`w-full md:w-auto px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${generating ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-500/20'
                                }`}
                        >
                            {generating ? 'Generating...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {/* Monthly Summary Table */}
                <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="px-4 md:px-8 py-5">Personnel</th>
                                    <th className="hidden md:table-cell px-8 py-5">Department</th>
                                    <th className="hidden lg:table-cell px-8 py-5 text-center">Working Days</th>
                                    <th className="px-4 md:px-8 py-5 text-center">Present</th>
                                    <th className="px-4 md:px-8 py-5 text-center text-red-500">Absent</th>
                                    <th className="hidden sm:table-cell px-8 py-5 text-center text-amber-500">Late</th>
                                    <th className="px-4 md:px-8 py-5 text-right">Hours</th>
                                    <th className="px-4 md:px-8 py-5 text-right text-orange-500">Overtime</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {generating ? (
                                    Array(3).fill(0).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan="8" className="px-8 py-6 h-16 bg-slate-50/50"></td>
                                        </tr>
                                    ))
                                ) : monthlyReport?.data.length > 0 ? (
                                    monthlyReport.data.map((row) => (
                                        <tr key={row.id} onClick={() => navigate('/admin/attendance/' + row.employee_id)} className="group hover:bg-slate-50 transition-colors cursor-pointer">
                                            <td className="px-4 md:px-8 py-5">
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] md:text-xs font-black text-slate-600 uppercase">
                                                        {row.name[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs md:text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">{row.name}</div>
                                                        <div className="text-[9px] md:text-[10px] font-medium text-slate-500 tracking-wider">ID: {row.employee_id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell px-8 py-5">
                                                <div className="flex items-center gap-2">
                                                    <Briefcase className="w-3.5 h-3.5 text-slate-600" />
                                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{row.department}</span>
                                                </div>
                                            </td>
                                            <td className="hidden lg:table-cell px-8 py-5 text-center font-bold text-slate-500 italic tabular-nums">
                                                {monthlyReport.workingDaysInMonth}
                                            </td>
                                            <td className="px-4 md:px-8 py-5 text-center">
                                                <div className="inline-flex items-center gap-1 px-2 md:gap-1.5 md:px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] md:text-[11px] font-black text-emerald-400 tabular-nums">
                                                    <CheckCircle className="w-3 h-3" /> {row.presentDays}
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-8 py-5 text-center">
                                                <div className={`inline-flex items-center gap-1 px-2 md:gap-1.5 md:px-3 py-1 rounded-full text-[10px] md:text-[11px] font-black tabular-nums ${row.absentDays > 3 ? 'bg-red-50 border border-red-100 text-red-600' : 'bg-slate-50 text-slate-500'
                                                    }`}>
                                                    <AlertTriangle className="w-3 h-3" /> {row.absentDays}
                                                </div>
                                            </td>
                                            <td className="hidden sm:table-cell px-8 py-5 text-center">
                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tabular-nums ${row.lateDays > 5 ? 'bg-amber-50 border border-amber-100 text-amber-600' : 'bg-slate-50 text-slate-500'
                                                    }`}>
                                                    <Timer className="w-3 h-3" /> {row.lateDays}
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-1.5 md:gap-2 text-xs md:text-sm font-black text-slate-800 tabular-nums">
                                                    <Clock className="w-3 md:w-3.5 h-3 md:h-3.5 text-blue-500" />
                                                    {row.totalWorkHours}h
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-1.5 md:gap-2 text-xs md:text-sm font-black text-orange-500 tabular-nums">
                                                    {row.totalOvertime}h
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-8 py-20 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <Calendar className="w-12 h-12 text-slate-900" />
                                                <div className="text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">No analytics data for this period</div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
