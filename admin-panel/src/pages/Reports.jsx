import React, { useState, useEffect } from 'react';
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

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase">Attendance Analytics</h1>
                    <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">Data Insights // Performance Audit</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <button className="flex-1 md:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-white text-[10px] md:text-xs font-black transition-all flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" /> Export
                    </button>
                    <button className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-white text-[10px] md:text-xs font-black transition-all flex items-center justify-center gap-2">
                        <FileText className="w-4 h-4" /> Audit Log
                    </button>
                </div>
            </div>

            {/* Visual Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Daily Trend */}
                <div className="card p-8 bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">Presence Volume</h2>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">7-Day Rolling Activity</p>
                        </div>
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="h-[200px] md:h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={reportData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#475569"
                                    fontSize={9}
                                    tickFormatter={(str) => format(new Date(str), 'MM/dd')}
                                />
                                <YAxis stroke="#475569" fontSize={9} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                    itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                                />
                                <Bar dataKey="present" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
                                <Bar dataKey="late" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Efficiency Chart */}
                <div className="card p-8 bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">Punctuality Score</h2>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Consistency Metrics</p>
                        </div>
                        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <Clock className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="h-[200px] md:h-[280px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={reportData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    stroke="#475569"
                                    fontSize={9}
                                    tickFormatter={(str) => format(new Date(str), 'MM/dd')}
                                />
                                <YAxis stroke="#475569" fontSize={9} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
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
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase">Monthly Report Generation</h2>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Personnel Aggregation // {months[selectedMonth - 1]} {selectedYear}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-950/50 border border-white/5 rounded-2xl">
                        <div className="flex items-center flex-1 md:flex-none">
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="bg-transparent text-[10px] md:text-xs font-black text-white uppercase tracking-widest px-3 md:px-4 py-2 focus:outline-none cursor-pointer flex-1"
                            >
                                {months.map((m, i) => (
                                    <option key={i} value={i + 1} className="bg-slate-900">{m}</option>
                                ))}
                            </select>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                className="bg-transparent text-[10px] md:text-xs font-black text-white uppercase tracking-widest px-3 md:px-4 py-2 border-l border-white/5 focus:outline-none cursor-pointer"
                            >
                                {years.map(y => (
                                    <option key={y} value={y} className="bg-slate-900">{y}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={fetchMonthlyReport}
                            disabled={generating}
                            className={`w-full md:w-auto px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${generating ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white'
                                }`}
                        >
                            {generating ? 'Generating...' : 'Refresh'}
                        </button>
                    </div>
                </div>

                {/* Monthly Summary Table */}
                <div className="rounded-3xl bg-white/[0.01] border border-white/[0.05] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/5 text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    <th className="px-4 md:px-8 py-5">Personnel</th>
                                    <th className="hidden md:table-cell px-8 py-5">Department</th>
                                    <th className="hidden lg:table-cell px-8 py-5 text-center">Working Days</th>
                                    <th className="px-4 md:px-8 py-5 text-center">Present</th>
                                    <th className="px-4 md:px-8 py-5 text-center text-red-400">Absent</th>
                                    <th className="hidden sm:table-cell px-8 py-5 text-center text-amber-400">Late</th>
                                    <th className="px-4 md:px-8 py-5 text-right">Hours</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.02]">
                                {generating ? (
                                    Array(3).fill(0).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan="7" className="px-8 py-6 h-16 bg-white/[0.01]"></td>
                                        </tr>
                                    ))
                                ) : monthlyReport?.data.length > 0 ? (
                                    monthlyReport.data.map((row) => (
                                        <tr key={row.id} className="group hover:bg-white/[0.02] transition-colors">
                                            <td className="px-4 md:px-8 py-5">
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-[10px] md:text-xs font-black text-slate-500 uppercase">
                                                        {row.name[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-xs md:text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate">{row.name}</div>
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
                                                <div className={`inline-flex items-center gap-1 px-2 md:gap-1.5 md:px-3 py-1 rounded-full text-[10px] md:text-[11px] font-black tabular-nums ${row.absentDays > 3 ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-slate-800 text-slate-500'
                                                    }`}>
                                                    <AlertTriangle className="w-3 h-3" /> {row.absentDays}
                                                </div>
                                            </td>
                                            <td className="hidden sm:table-cell px-8 py-5 text-center">
                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black tabular-nums ${row.lateDays > 5 ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'
                                                    }`}>
                                                    <Timer className="w-3 h-3" /> {row.lateDays}
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-8 py-5 text-right">
                                                <div className="flex items-center justify-end gap-1.5 md:gap-2 text-xs md:text-sm font-black text-white tabular-nums">
                                                    <Clock className="w-3 md:w-3.5 h-3 md:h-3.5 text-blue-500" />
                                                    {row.totalWorkHours}h
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="px-8 py-20 text-center">
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
