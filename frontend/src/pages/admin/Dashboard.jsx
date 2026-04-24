
import React, { useEffect, useState, useCallback } from 'react';
import { Users, AlertTriangle, Fingerprint, DoorOpen, RefreshCw } from 'lucide-react';
import { apiService } from '../../services/api.service';

const StatCard = ({ title, value, icon: Icon, color, loading }) => (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between group hover:border-slate-700 transition-all">
        <div>
            <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</p>
            {loading ? (
                <div className="h-9 w-16 bg-slate-800 animate-pulse mt-2 rounded-lg"></div>
            ) : (
                <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
            )}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
    </div>
);

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalUsers: 0,
        failedAttempts: 0,
        activeDevices: 0,
        todayEntries: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());

    const loadData = useCallback(async (showLoading = false) => {
        if (showLoading) setLoading(true);
        try {
            const data = await apiService.getDashboardStats();
            setStats(data);
            setLastUpdated(new Date());
            setError(null);
        } catch (err) {
            console.error("Dashboard Stats Error:", err);
            setError("Failed to fetch latest system stats");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData(true);

        // Auto-refresh every 10 seconds
        const interval = setInterval(() => {
            loadData(false);
        }, 10000);

        return () => clearInterval(interval);
    }, [loadData]);

    if (error && loading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-slate-900/50 rounded-3xl border border-slate-800">
                <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                <p>{error}</p>
                <button onClick={() => loadData(true)} className="mt-4 px-4 py-2 bg-slate-800 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white">System Overview</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Last updated: {lastUpdated.toLocaleTimeString()}
                    </p>
                </div>
                <button
                    onClick={() => loadData(true)}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
                    title="Refresh Now"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Users" value={stats.totalUsers} icon={Users} color="bg-blue-600" loading={loading} />
                <StatCard title="Today's Entries" value={stats.todayEntries} icon={DoorOpen} color="bg-emerald-600" loading={loading} />
                <StatCard title="Failed Attempts" value={stats.failedAttempts} icon={AlertTriangle} color="bg-red-600" loading={loading} />
                <StatCard title="Active Devices" value={stats.activeDevices} icon={Fingerprint} color="bg-purple-600" loading={loading} />
            </div>

            {error && !loading && (
                <div className="mt-6 flex items-center gap-2 text-red-400 text-sm bg-red-400/10 p-4 rounded-xl border border-red-400/20">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 h-64 flex flex-col items-center justify-center text-slate-500 group hover:border-slate-700 transition-colors">
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                        <div className="w-2/3 h-full bg-blue-500/50"></div>
                    </div>
                    Chart Placeholder (Entries over time)
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 h-64 flex items-center justify-center text-slate-500 group hover:border-slate-700 transition-colors">
                    Map Placeholder (Device Locations)
                </div>
            </div>
        </div>
    );
}
