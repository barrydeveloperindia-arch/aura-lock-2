
import React, { useState, useEffect, useCallback } from 'react';
import { Filter, Download, Calendar, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { apiService } from '../../services/api.service';
import { format } from 'date-fns';

export default function LogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        search: '',
        method: '',
        status: '',
        startDate: '',
        endDate: '',
        page: 1,
        limit: 10
    });
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [showFilters, setShowFilters] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await apiService.getLogs(filters);
            setLogs(response.logs);
            setPagination(response.pagination);
        } catch (error) {
            console.error("Failed to fetch logs:", error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchLogs();
        }, 500); // Debounce search
        return () => clearTimeout(timer);
    }, [fetchLogs]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value, page: 1 }));
    };

    const resetFilters = () => {
        setFilters({
            search: '',
            method: '',
            status: '',
            startDate: '',
            endDate: '',
            page: 1,
            limit: 10
        });
    };

    const exportToCSV = () => {
        const headers = ['Timestamp', 'User', 'Method', 'Status'];
        const csvContent = [
            headers.join(','),
            ...logs.map(log => [
                format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
                log.name,
                log.method,
                log.status
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `access_logs_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-white">Access Logs</h1>
                <div className="flex gap-3 w-full md:w-auto">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors text-sm font-medium border ${showFilters ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                    >
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                    <button
                        onClick={exportToCSV}
                        className="flex items-center gap-2 bg-slate-900 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors text-sm font-medium"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-semibold">Filter Options</h3>
                        <button onClick={resetFilters} className="text-blue-400 text-xs hover:underline flex items-center gap-1">
                            <X className="w-3 h-3" /> Reset All
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                            <label className="text-slate-400 text-xs uppercase font-bold">Search User</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    name="search"
                                    value={filters.search}
                                    onChange={handleFilterChange}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-white focus:border-blue-500 outline-none"
                                    placeholder="Enter name..."
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-slate-400 text-xs uppercase font-bold">Method</label>
                            <select
                                name="method"
                                value={filters.method}
                                onChange={handleFilterChange}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-4 text-white focus:border-blue-500 outline-none cursor-pointer appearance-none"
                            >
                                <option value="">All Methods</option>
                                <option value="Face">Face</option>
                                <option value="Fingerprint">Fingerprint</option>
                                <option value="RFID">RFID</option>
                                <option value="PIN">PIN</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-slate-400 text-xs uppercase font-bold">Status</label>
                            <select
                                name="status"
                                value={filters.status}
                                onChange={handleFilterChange}
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-4 text-white focus:border-blue-500 outline-none cursor-pointer appearance-none"
                            >
                                <option value="">All Status</option>
                                <option value="Granted">Granted</option>
                                <option value="Denied">Denied</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-slate-400 text-xs uppercase font-bold">Date Range</label>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    name="startDate"
                                    value={filters.startDate}
                                    onChange={handleFilterChange}
                                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs focus:border-blue-500 outline-none"
                                />
                                <input
                                    type="date"
                                    name="endDate"
                                    value={filters.endDate}
                                    onChange={handleFilterChange}
                                    className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-white text-xs focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-bold tracking-widest border-b border-slate-800">
                            <tr>
                                <th className="p-4 pl-6">Timestamp</th>
                                <th className="p-4">User</th>
                                <th className="p-4">Method</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 pr-6">Device ID</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="5" className="p-4 px-6 h-16 bg-slate-800/10 mb-2"></td>
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="p-12 text-center text-slate-500">No records found matching your criteria.</td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log._id} className="hover:bg-slate-800/50 transition-colors group">
                                        <td className="p-4 pl-6 text-slate-400 font-mono text-xs">
                                            {format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-xs">
                                                    {log.name.charAt(0)}
                                                </div>
                                                <div className="font-medium text-white">{log.name}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="text-slate-300 text-sm flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${log.method === 'Face' ? 'bg-purple-400' :
                                                        log.method === 'Fingerprint' ? 'bg-blue-400' : 'bg-amber-400'
                                                    }`} />
                                                {log.method}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${log.status === 'Granted'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}
                                            >
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="p-4 pr-6 text-slate-500 font-mono text-xs">{log.deviceId}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && logs.length > 0 && (
                    <div className="p-4 bg-slate-950/50 flex items-center justify-between border-t border-slate-800">
                        <p className="text-xs text-slate-500">
                            Showing <span className="text-white">{(filters.page - 1) * filters.limit + 1}</span> to <span className="text-white">{Math.min(filters.page * filters.limit, pagination.total)}</span> of <span className="text-white">{pagination.total}</span> logs
                        </p>
                        <div className="flex gap-2">
                            <button
                                disabled={filters.page === 1}
                                onClick={() => setFilters(p => ({ ...p, page: p.page - 1 }))}
                                className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex items-center px-4 text-xs font-bold text-white bg-slate-900 border border-slate-800 rounded-lg">
                                {filters.page} / {pagination.pages}
                            </div>
                            <button
                                disabled={filters.page === pagination.pages}
                                onClick={() => setFilters(p => ({ ...p, page: p.page + 1 }))}
                                className="p-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
