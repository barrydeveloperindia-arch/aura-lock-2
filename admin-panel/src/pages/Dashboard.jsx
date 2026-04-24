import React, { useState, useEffect } from 'react';
import {
    Clock, Users, UserCheck, UserX, AlertTriangle, Shield,
    TrendingUp, TrendingDown, Minus, Activity, Building2, ScanLine,
    BarChart2, ShieldCheck, Percent, Key, Unlock, Lock
} from 'lucide-react';
import { apiService } from '../services/api';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function Dashboard() {
    const [statsData, setStatsData] = useState(null);
    const [activityData, setActivityData] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [doorStatus, setDoorStatus] = useState('Locked');
    const [isOnline, setIsOnline] = useState(true);
    const [lastUnlock, setLastUnlock] = useState('Never');
    const [unlocking, setUnlocking] = useState(false);

    const handleRemoteUnlock = async () => {
        setUnlocking(true);
        try {
            const res = await apiService.unlockDoor();
            if (res.success) {
                setDoorStatus('Unlocked');
                setLastUnlock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                setTimeout(() => setDoorStatus('Locked'), 5000);
            }
        } catch (e) {
            console.error('Remote unlock failed');
        } finally {
            setUnlocking(false);
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [stats, activity, analyticsData] = await Promise.all([
                    apiService.getDashboardStats(),
                    apiService.getActivityStats(),
                    apiService.getAttendanceAnalytics(),
                ]);
                setStatsData(stats);
                setActivityData(activity);
                setAnalytics(analyticsData);
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        const fetchDoorHealth = async () => {
            try {
                const health = await apiService.getDoorStatus();
                setIsOnline(health.online);
            } catch (e) {
                setIsOnline(false);
            }
        };

        fetchData();
        fetchDoorHealth();
        const interval = setInterval(fetchData, 60000); // Stats: 60s
        const healthInterval = setInterval(fetchDoorHealth, 10000); // Health: 10s
        return () => {
            clearInterval(interval);
            clearInterval(healthInterval);
        };
    }, []);

    // ── 5 KPI definitions ──────────────────────────────────────────────────
    const kpis = [
        {
            label: 'Total Employees',
            value: statsData?.total_employees ?? statsData?.totalUsers ?? 0,
            sub: 'Registered personnel',
            icon: Users,
            gradient: 'from-blue-600/20 to-blue-600/5',
            border: 'border-blue-500/20',
            accent: 'text-blue-400',
            dot: 'bg-blue-500',
        },
        {
            label: 'Present Today',
            value: statsData?.present_today ?? statsData?.isPresent ?? 0,
            sub: 'Checked in so far',
            icon: UserCheck,
            gradient: 'from-emerald-600/20 to-emerald-600/5',
            border: 'border-emerald-500/20',
            accent: 'text-emerald-400',
            dot: 'bg-emerald-500',
        },
        {
            label: 'Absent Today',
            value: statsData?.absent_today ?? statsData?.absentToday ?? 0,
            sub: 'Not yet checked in',
            icon: UserX,
            gradient: 'from-red-600/20 to-red-600/5',
            border: 'border-red-500/20',
            accent: 'text-red-400',
            dot: 'bg-red-500',
        },
        {
            label: 'Late Today',
            value: statsData?.late_today ?? statsData?.lateToday ?? 0,
            sub: 'Arrived after 09:15',
            icon: AlertTriangle,
            gradient: 'from-amber-600/20 to-amber-600/5',
            border: 'border-amber-500/20',
            accent: 'text-amber-400',
            dot: 'bg-amber-500',
        },
        {
            label: 'Total Scans Today',
            value: statsData?.total_scans_today ?? statsData?.todayEntries ?? 0,
            sub: 'All biometric events',
            icon: ScanLine,
            gradient: 'from-indigo-600/20 to-indigo-600/5',
            border: 'border-indigo-500/20',
            accent: 'text-indigo-400',
            dot: 'bg-indigo-500',
        },
    ];

    const growth = analytics?.monthly?.growthPercent ?? 0;
    const GrowthIcon = growth > 0 ? TrendingUp : growth < 0 ? TrendingDown : Minus;
    const growthColor = growth > 0 ? 'text-emerald-400' : growth < 0 ? 'text-red-400' : 'text-slate-400';

    const tooltipStyle = {
        contentStyle: { backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', fontSize: '11px' },
        itemStyle: { fontWeight: 700 },
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black text-white mb-1 md:mb-2 tracking-tighter">Command Center</h1>
                    <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">Operational Oversight // AuraLock v2.4</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest text-nowrap">System Online</span>
                </div>
            </div>

            {/* ── 5 KPI Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                {kpis.map((kpi, i) => (
                    <div key={i}
                        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${kpi.gradient} border ${kpi.border} p-4 sm:p-6
                                    hover:scale-[1.02] hover:shadow-lg transition-all duration-300 group`}>
                        {/* background glow */}
                        <div className={`absolute -right-4 -top-4 w-16 h-16 sm:-right-6 sm:-top-6 sm:w-24 sm:h-24 rounded-full ${kpi.dot} opacity-5 group-hover:opacity-10 transition-opacity blur-xl`} />

                        {/* icon */}
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-black/30 border ${kpi.border} flex items-center justify-center mb-3 sm:mb-4`}>
                            <kpi.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${kpi.accent}`} />
                        </div>

                        {/* value */}
                        <div className={`text-2xl sm:text-4xl font-black tabular-nums ${kpi.accent} mb-0.5 sm:mb-1 transition-transform group-hover:translate-x-0.5`}>
                            {loading ? (
                                <div className="w-10 h-6 sm:w-16 sm:h-9 bg-white/5 rounded-lg animate-pulse" />
                            ) : kpi.value}
                        </div>

                        {/* label */}
                        <div className="text-[11px] sm:text-sm font-bold text-white/90 mb-0.5 leading-tight">{kpi.label}</div>

                        {/* sub-label */}
                        <div className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em] leading-tight line-clamp-1">{kpi.sub}</div>

                        {/* live dot */}
                        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1">
                            <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${kpi.dot} animate-pulse`} />
                        </div>
                    </div>
                ))}

                {/* --- Door Status Card --- */}
                <div className={`relative overflow-hidden rounded-2xl bg-slate-900/50 border border-white/5 p-4 sm:p-6 
                                hover:scale-[1.02] hover:shadow-lg transition-all duration-300 group`}>
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-black/30 border border-white/5 flex items-center justify-center`}>
                            {doorStatus === 'Locked' ? <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" /> : <Unlock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 animate-pulse" />}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded 
                                            ${doorStatus === 'Locked' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                                {doorStatus}
                            </div>
                            <div className={`flex items-center gap-1 text-[7px] sm:text-[8px] font-bold uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                                <div className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                <span className="hidden sm:inline">{isOnline ? 'Hardware Online' : 'Hardware Offline'}</span>
                                <span className="sm:hidden">{isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-3 sm:mb-4">
                        <div className="text-[11px] sm:text-sm font-bold text-white/90 mb-0.5 leading-tight">Door Status</div>
                        <div className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">
                            Last Unlock: <span className="text-slate-300">{lastUnlock}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleRemoteUnlock}
                        disabled={unlocking || doorStatus === 'Unlocked'}
                        className="w-full py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 
                                   rounded-xl text-[9px] sm:text-[10px] font-black text-white uppercase tracking-widest transition-all
                                   flex items-center justify-center gap-2 group/btn"
                    >
                        {unlocking ? (
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Key className="w-3 h-3 group-hover/btn:rotate-12 transition-transform" />
                                <span className="hidden sm:inline">Remote Unlock</span>
                                <span className="sm:hidden">Unlock</span>
                            </>
                        )}
                    </button>

                    {/* decorative pulse if unlocked */}
                    {doorStatus === 'Unlocked' && (
                        <div className="absolute inset-0 bg-blue-500/5 transition-opacity" />
                    )}
                </div>
            </div>

            {/* ── Analytics Row 1: Daily Trend + Monthly Pulse ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Daily Attendance Trend – area chart */}
                <div className="lg:col-span-2 p-5 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Activity className="w-4 h-4 text-blue-400" />
                                <h2 className="text-lg font-black text-white tracking-tight">Daily Attendance Trend</h2>
                            </div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Present vs Late // Last 15 Days</p>
                        </div>
                        <div className="flex items-center flex-wrap gap-4 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" />Present</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" />Late</div>
                        </div>
                    </div>
                    <div className="h-[200px] md:h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={analytics?.dailyTrend || []}>
                                <defs>
                                    <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gLate" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                                <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} axisLine={false}
                                    tickFormatter={d => { try { return format(parseISO(d), 'MMM d'); } catch { return d; } }} />
                                <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                                <Tooltip {...tooltipStyle} />
                                <Area type="monotone" dataKey="present" stroke="#10b981" fill="url(#gPresent)" strokeWidth={2.5} dot={false} name="Present" />
                                <Area type="monotone" dataKey="late" stroke="#f59e0b" fill="url(#gLate)" strokeWidth={2.5} dot={false} name="Late" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Monthly Pulse card */}
                <div className="p-5 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart2 className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-lg font-black text-white tracking-tight">Monthly Pulse</h2>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-8">Active Attendance // This vs Last Month</p>
                    </div>

                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Current Month</p>
                            <div className="text-4xl font-black text-white tabular-nums">{loading ? '—' : analytics?.monthly?.current ?? 0}</div>
                            <p className="text-[9px] text-slate-500 mt-1">unique attendees</p>
                        </div>
                        <div className="w-full h-px bg-white/5" />
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Previous Month</p>
                                <div className="text-2xl font-black text-slate-400 tabular-nums">{loading ? '—' : analytics?.monthly?.previous ?? 0}</div>
                            </div>
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 ${growthColor}`}>
                                <GrowthIcon className="w-4 h-4" />
                                <span className="text-sm font-black">{growth > 0 ? `+${growth}` : growth}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 p-4 rounded-2xl bg-slate-950/40 border border-white/5">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">System Integrity</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full w-[99%] transition-all" />
                        </div>
                        <p className="text-[9px] text-slate-600 mt-2 font-semibold">Network Resilience: 99.9%</p>
                    </div>
                </div>
            </div>

            {/* ── Analytics Row 2: Department Comparison ── */}
            <div className="p-5 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-purple-400" />
                            <h2 className="text-lg font-black text-white tracking-tight">Department Attendance</h2>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Present vs Absent // Today's Breakdown</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-4 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" />Present</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" />Absent</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-600" />Total</div>
                    </div>
                </div>
                <div className="h-[200px] md:h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics?.departmentComparison || []} barGap={6} barCategoryGap="25%">
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="department" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip {...tooltipStyle} />
                            <Bar dataKey="present" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Present" />
                            <Bar dataKey="absent" fill="#ef4444" radius={[6, 6, 0, 0]} name="Absent" />
                            <Bar dataKey="total" fill="#334155" radius={[6, 6, 0, 0]} name="Total" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── Monthly Attendance Rate (last 6 months) ── */}
            <div className="p-5 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Percent className="w-4 h-4 text-teal-400" />
                            <h2 className="text-lg font-black text-white tracking-tight">Monthly Attendance Rate</h2>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">
                            Unique Attendees as % of Workforce // Last 6 Months
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                        <span className="text-[10px] font-black text-teal-400 tabular-nums">
                            {loading ? '—' : `${analytics?.monthlyRate?.[analytics.monthlyRate.length - 1]?.rate ?? 0}%`}
                        </span>
                        <span className="text-[9px] text-slate-500 font-bold">this month</span>
                    </div>
                </div>
                <div className="h-[220px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics?.monthlyRate || []} barCategoryGap="30%">
                            <defs>
                                <linearGradient id="gRate" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#0891b2" stopOpacity={0.6} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="month" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false}
                                domain={[0, 100]} tickFormatter={v => `${v}%`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#020617', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', fontSize: '11px' }}
                                itemStyle={{ fontWeight: 700, color: '#14b8a6' }}
                                formatter={(value) => [`${value}%`, 'Attendance Rate']}
                                labelStyle={{ color: '#94a3b8', fontWeight: 700 }}
                            />
                            <Bar dataKey="rate" fill="url(#gRate)" radius={[8, 8, 0, 0]} name="Attendance Rate"
                                label={{ position: 'top', fontSize: 9, fill: '#64748b', formatter: v => `${v}%` }} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ── 24h Access Distribution ── */}
            <div className="p-5 md:p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Shield className="w-4 h-4 text-slate-400" />
                            <h2 className="text-lg font-black text-white tracking-tight">Access Distribution</h2>
                        </div>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em]">Biometric Activity // Last 24 Hours</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-4 text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500" />Face</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500" />Fingerprint</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" />RFID</div>
                    </div>
                </div>
                <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={activityData}>
                            <defs>
                                <linearGradient id="gFace" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gFinger" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                            <XAxis dataKey="time" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} interval={3} />
                            <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip {...tooltipStyle} />
                            <Area type="monotone" dataKey="Face" stroke="#3b82f6" fill="url(#gFace)" strokeWidth={2} dot={false} />
                            <Area type="monotone" dataKey="Fingerprint" stroke="#a855f7" fill="url(#gFinger)" strokeWidth={2} dot={false} />
                            <Area type="monotone" dataKey="RFID" stroke="#f59e0b" fill="#f59e0b20" strokeWidth={2} dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
