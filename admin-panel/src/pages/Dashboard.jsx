import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Clock, Users, UserCheck, UserX, AlertTriangle, Shield,
    TrendingUp, TrendingDown, Minus, Activity, Building2, ScanLine,
    BarChart2, ShieldCheck, Percent, Key, Unlock, Lock, CalendarOff
} from 'lucide-react';
import { apiService } from '../services/api';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function Dashboard() {
    const navigate = useNavigate();
    const [statsData, setStatsData] = useState(null);
    const [activityData, setActivityData] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [systemOnline, setSystemOnline] = useState(true);
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
        } catch {
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
                setSystemOnline(true);
                setActivityData(activity);
                setAnalytics(analyticsData);
            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
                setSystemOnline(false);
            } finally {
                setLoading(false);
            }
        };

        const fetchDoorHealth = async () => {
            try {
                const health = await apiService.getDoorStatus();
                setIsOnline(health.online);
            } catch {
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

    const TONES = {
        blue: { chip: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
        emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
        red: { chip: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
        amber: { chip: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
        indigo: { chip: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-500' },
        violet: { chip: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
    };
    const onLeaveList = statsData?.on_leave_list ?? [];
    const totalEmp = statsData?.total_employees ?? statsData?.totalUsers ?? 0;
    const presentN = statsData?.present_today ?? statsData?.isPresent ?? 0;
    const pctOf = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

    // ── 5 KPI definitions ──────────────────────────────────────────────────
    const kpis = [
        {
            label: 'Total Employees',
            value: statsData?.total_employees ?? statsData?.totalUsers ?? 0,
            sub: 'Active on the system',
            icon: Users,
            tone: 'blue',
            to: '/admin/users',
        },
        {
            label: 'Present Today',
            value: statsData?.present_today ?? statsData?.isPresent ?? 0,
            sub: `${pctOf(presentN, totalEmp)}% of workforce`,
            icon: UserCheck,
            tone: 'emerald',
            to: '/admin/attendance',
        },
        {
            label: 'Absent Today',
            value: statsData?.absent_today ?? statsData?.absentToday ?? 0,
            sub: `${pctOf(statsData?.absent_today ?? statsData?.absentToday ?? 0, totalEmp)}% not checked in`,
            icon: UserX,
            tone: 'red',
            to: '/admin/attendance?view=absent',
        },
        {
            label: 'On Leave Today',
            value: statsData?.on_leave_today ?? 0,
            sub: 'Approved / pending leave',
            icon: CalendarOff,
            tone: 'violet',
            to: '/admin/leaves',
        },
        {
            label: 'Late Today',
            value: statsData?.late_today ?? statsData?.lateToday ?? 0,
            sub: 'Arrived after 09:15',
            icon: AlertTriangle,
            tone: 'amber',
            to: '/admin/attendance?status=LATE',
        },
        {
            label: 'Total Scans Today',
            value: statsData?.total_scans_today ?? statsData?.todayEntries ?? 0,
            sub: 'All biometric events',
            icon: ScanLine,
            tone: 'indigo',
            to: '/admin/logs',
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
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1 tracking-tight">Command Center</h1>
                    <p className="text-slate-500 text-sm">Live attendance and access overview &middot; Englabs Attendance Tracker</p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${systemOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                    <div className={`w-2 h-2 rounded-full ${systemOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className={`text-xs font-semibold text-nowrap ${systemOnline ? 'text-emerald-700' : 'text-rose-700'}`}>{systemOnline ? 'System online' : 'Backend unreachable'}</span>
                </div>
            </div>

            {/* ── On leave today ── */}
            {onLeaveList.length > 0 && (
                <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                            <CalendarOff className="w-4 h-4 text-violet-600" /> On leave today
                            <span className="text-xs font-semibold bg-violet-50 text-violet-700 rounded-full px-2 py-0.5">{onLeaveList.length}</span>
                        </h2>
                        <button type="button" onClick={() => navigate('/admin/leaves')} className="text-sm font-medium text-blue-600 hover:text-blue-700">Open leave register</button>
                    </div>
                    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {onLeaveList.map(l => (
                            <li key={l.employee_id} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                                <span className="mt-0.5 text-xs font-bold text-violet-700 bg-violet-50 rounded px-1.5 py-0.5">{l.type}</span>
                                <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 truncate">{l.name} <span className="font-mono text-xs font-normal text-slate-500">{l.employee_id}</span></div>
                                    <div className="text-xs text-slate-500 truncate">{[l.company && l.company !== 'Englabs India Pvt Ltd' ? l.company : null, l.department].filter(Boolean).join(' · ')}</div>
                                    {l.note && <div className="text-xs text-slate-500 truncate">{l.note}</div>}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {kpis.map((kpi, i) => {
                    const t = TONES[kpi.tone];
                    return (
                        <button key={i} type="button" onClick={() => navigate(kpi.to)}
                            className="group text-left rounded-xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 transition cursor-pointer">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs sm:text-sm font-semibold text-slate-600">{kpi.label}</span>
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.chip}`}>
                                    <kpi.icon className="w-4 h-4" />
                                </span>
                            </div>
                            <div className="text-3xl sm:text-4xl font-bold tabular-nums text-slate-900 leading-none mb-2">
                                {loading ? <div className="w-14 h-8 bg-slate-100 rounded animate-pulse" /> : kpi.value}
                            </div>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                                <span>{kpi.sub}</span>
                                <span className="opacity-0 group-hover:opacity-100 transition text-blue-600 font-medium">View &rarr;</span>
                            </div>
                        </button>
                    );
                })}

                {/* --- Door Status Card --- */}
                <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 p-4 sm:p-5 shadow-sm col-span-2 lg:col-span-1 xl:col-span-2">
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border-slate-200 flex items-center justify-center`}>
                            {doorStatus === 'Locked' ? <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" /> : <Unlock className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 animate-pulse" />}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className={`text-xs font-semibold px-2 py-1 rounded 
                                            ${doorStatus === 'Locked' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                {doorStatus}
                            </div>
                            <div className={`flex items-center gap-1 text-xs font-medium ${isOnline ? 'text-emerald-500' : 'text-red-500'}`}>
                                <div className={`w-1 h-1 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                                <span className="hidden sm:inline">{isOnline ? 'Hardware Online' : 'Hardware Offline'}</span>
                                <span className="sm:hidden">{isOnline ? 'Online' : 'Offline'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mb-3 sm:mb-4">
                        <div className="text-[11px] sm:text-sm font-bold text-slate-900/90 mb-0.5 leading-tight">Door Status</div>
                        <div className="text-xs text-slate-500 leading-tight">
                            Last Unlock: <span className="text-slate-300">{lastUnlock}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleRemoteUnlock}
                        disabled={unlocking || doorStatus === 'Unlocked'}
                        className="w-full py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-800 
                                   rounded-xl text-sm font-semibold text-slate-900 transition-all
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
                <div className="lg:col-span-2 p-5 md:p-8 rounded-3xl bg-white border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Activity className="w-4 h-4 text-blue-400" />
                                <h2 className="text-base font-semibold text-slate-900">Daily Attendance Trend</h2>
                            </div>
                            <p className="text-sm text-slate-500">Present vs Late // Last 15 Days</p>
                        </div>
                        <div className="flex items-center flex-wrap gap-4 text-xs font-medium text-slate-500">
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
                <div className="p-5 md:p-8 rounded-3xl bg-white border-slate-200 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart2 className="w-4 h-4 text-indigo-400" />
                            <h2 className="text-base font-semibold text-slate-900">Monthly Pulse</h2>
                        </div>
                        <p className="text-sm text-slate-500 mb-8">Active Attendance // This vs Last Month</p>
                    </div>

                    <div className="flex flex-col gap-6">
                        <div>
                            <p className="text-xs font-medium text-slate-500 mb-2">Current Month</p>
                            <div className="text-4xl font-bold text-slate-900 tabular-nums">{loading ? '—' : analytics?.monthly?.current ?? 0}</div>
                            <p className="text-xs text-slate-500 mt-1">unique attendees</p>
                        </div>
                        <div className="w-full h-px bg-white/5" />
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-slate-500 mb-1">Same days last month</p>
                                <div className="text-2xl font-bold text-slate-500 tabular-nums">{loading ? '—' : analytics?.monthly?.previous ?? 0}</div>
                            </div>
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 ${growthColor}`}>
                                <GrowthIcon className="w-4 h-4" />
                                <span className="text-sm font-black">{growth > 0 ? `+${growth}` : growth}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Analytics Row 2: Department Comparison ── */}
            <div className="p-5 md:p-8 rounded-3xl bg-white border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Building2 className="w-4 h-4 text-purple-400" />
                            <h2 className="text-base font-semibold text-slate-900">Department Attendance</h2>
                        </div>
                        <p className="text-sm text-slate-500">Present vs Absent // Today's Breakdown</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-4 text-xs font-medium text-slate-500">
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
            <div className="p-5 md:p-8 rounded-3xl bg-white border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Percent className="w-4 h-4 text-teal-400" />
                            <h2 className="text-base font-semibold text-slate-900">Monthly Attendance Rate</h2>
                        </div>
                        <p className="text-sm text-slate-500">
                            Unique Attendees as % of Workforce // Last 6 Months
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                        <span className="text-[10px] font-black text-teal-400 tabular-nums">
                            {loading ? '—' : `${analytics?.monthlyRate?.[analytics.monthlyRate.length - 1]?.rate ?? 0}%`}
                        </span>
                        <span className="text-xs text-slate-500">this month</span>
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
            <div className="p-5 md:p-8 rounded-3xl bg-white border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Shield className="w-4 h-4 text-slate-400" />
                            <h2 className="text-base font-semibold text-slate-900">Access Distribution</h2>
                        </div>
                        <p className="text-sm text-slate-500">Biometric Activity // Last 24 Hours</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-4 text-xs font-medium text-slate-500">
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
