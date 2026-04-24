import React, { useState, useEffect, useCallback } from 'react';
import {
    Lock, Unlock, Shield, Activity, History,
    AlertCircle, Clock, Key, CheckCircle2, Wifi, WifiOff, Server, RefreshCw,
    Search, Bluetooth, Zap, RotateCcw, AlertTriangle, Info
} from 'lucide-react';
import { apiService } from '../services/api';

const SECTION_STYLE = "bg-white/[0.02] border border-white/[0.05] rounded-[2rem] md:rounded-3xl p-5 md:p-8 backdrop-blur-xl shadow-2xl overflow-hidden relative group transition-all duration-500 hover:border-white/10";

export default function DoorControl() {
    const [doorState, setDoorState] = useState({
        isLocked: true,
        isOnline: null,
        isConnected: false,
        loading: false,
        lastCommand: 'None',
        lastActivity: null,
        rssi: -100
    });
    const [deviceInfo, setDeviceInfo] = useState({ name: 'Englabs_MD', mac: '58:8C:81:CC:65:29' });
    const [scanResults, setScanResults] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [logs, setLogs] = useState([]);
    const [alert, setAlert] = useState(null);
    const [showEmergencyModal, setShowEmergencyModal] = useState(false);

    const showAlert = (type, message) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 5000);
    };

    const fetchLogs = useCallback(async () => {
        try {
            const data = await apiService.getLogs({ limit: 10 });
            setLogs(data.logs || []);
        } catch (e) { console.error('Log fetch error:', e); }
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const status = await apiService.getBleStatus();
            setDoorState(prev => ({
                ...prev,
                isOnline: status.online,
                isConnected: status.isConnected,
                isLocked: status.isLocked !== undefined ? status.isLocked : prev.isLocked,
                rssi: status.rssi || (status.online ? -65 : -100),
                lastActivity: new Date()
            }));
            if (status.mac) setDeviceInfo(prev => ({ ...prev, name: status.name, mac: status.mac }));
        } catch (e) {
            setDoorState(prev => ({ ...prev, isOnline: false }));
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchLogs();
        startScan(); // 🚀 Auto-scan on mount

        const interval = setInterval(() => {
            fetchStatus();
            fetchLogs();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus, fetchLogs]); // Note: startScan not in deps to avoid infinite loop

    const handleAction = async (action, apiCall) => {
        setDoorState(prev => ({ ...prev, loading: true, lastCommand: action }));
        try {
            const res = await apiCall();
            if (res.success) {
                showAlert('success', res.message || `${action} executed successfully.`);
                if (action === 'Unlock' || action === 'Emergency Unlock') {
                    setDoorState(prev => ({ ...prev, isLocked: false }));
                } else if (action === 'Lock') {
                    setDoorState(prev => ({ ...prev, isLocked: true }));
                }
                fetchLogs();
            } else {
                showAlert('error', res.message || `Failed to ${action.toLowerCase()}.`);
            }
        } catch (e) {
            showAlert('error', `Communication failure for ${action}.`);
        } finally {
            setDoorState(prev => ({ ...prev, loading: false }));
        }
    };

    const startScan = async () => {
        setIsScanning(true);
        try {
            const res = await apiService.scanBleDevices();
            if (res.success) setScanResults(res.devices || []);
        } catch (e) { showAlert('error', 'Scanning failed.'); }
        finally { setIsScanning(false); }
    };

    const handleConnection = async (type) => {
        setIsConnecting(true);
        try {
            const res = type === 'connect' ? await apiService.connectBle() : await apiService.disconnectBle();
            if (res.success) {
                showAlert('success', res.message);
                fetchStatus();
            } else {
                showAlert('error', res.message);
            }
        } catch (e) { showAlert('error', 'Connection toggle failed.'); }
        finally { setIsConnecting(false); }
    };

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-6 duration-1000">
            {/* Header with Live Badge */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black text-white tracking-tighter mb-2">Door Manager <span className="text-blue-500">v2.1</span></h1>
                    <div className="flex flex-wrap items-center gap-2 md:gap-4">
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em]">Hardware Ecosystem Control</p>
                        <div className="hidden md:block h-px w-12 bg-white/10" />
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest
                            ${doorState.isConnected ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                doorState.isOnline ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                    doorState.isOnline === false ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                        'bg-slate-500/10 border-slate-500/20 text-slate-400'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${doorState.isConnected ? 'bg-emerald-400 animate-pulse' : doorState.isOnline ? 'bg-amber-400' : 'bg-red-400'}`} />
                            {doorState.isConnected ? 'CONNECTED' : doorState.isOnline ? 'Reachable' : doorState.isOnline === false ? 'Disconnected' : 'Syncing...'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Alert Notification */}
            {alert && (
                <div className={`fixed top-8 right-8 z-50 p-4 rounded-2xl flex items-center gap-4 border shadow-2xl animate-in fade-in slide-in-from-right-4 
                    ${alert.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' : 'bg-red-950/80 border-red-500/30 text-red-400'}`}>
                    {alert.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    <span className="text-sm font-bold tracking-tight">{alert.message}</span>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* LEFT COLUMN: Controls & Device Info */}
                <div className="xl:col-span-8 space-y-8">

                    {/* Main Hardware Status Card */}
                    <div className={SECTION_STYLE}>
                        <div className="absolute top-0 right-0 p-8 flex flex-col items-end opacity-20 pointer-events-none group-hover:opacity-40 transition-opacity">
                            <Bluetooth className="w-32 h-32 text-blue-500" />
                        </div>
                        <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-center">
                            {/* Visual Lock Indicator */}
                            <div className="relative flex-shrink-0">
                                <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center border-4 transition-all duration-700
                                    ${doorState.isLocked
                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400 shadow-[0_0_60px_rgba(16,185,129,0.1)]'
                                        : 'bg-blue-600/10 border-blue-500/30 text-blue-400 shadow-[0_0_80px_rgba(59,130,246,0.2)]'}`}>
                                    {doorState.isLocked ? <Lock className="w-12 h-12 md:w-20 md:h-20" /> : <Unlock className="w-12 h-12 md:w-20 md:h-20" />}
                                </div>
                                <div className="absolute -bottom-2 md:-bottom-4 left-1/2 -translate-x-1/2 px-4 md:px-6 py-1 md:py-2 rounded-xl md:rounded-2xl bg-black/60 border border-white/10 backdrop-blur-md">
                                    <span className={`text-sm md:text-xl font-black tracking-tighter uppercase ${doorState.isLocked ? 'text-emerald-400' : 'text-blue-400'}`}>
                                        {doorState.isLocked ? 'Locked' : 'Unlocked'}
                                    </span>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="flex-grow grid grid-cols-2 md:grid-cols-3 gap-y-10 gap-x-6 w-full">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Target Device</p>
                                    <h3 className="text-xl font-black text-white truncate">{deviceInfo.name}</h3>
                                    <code className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded mt-1 block w-fit italic">{deviceInfo.mac}</code>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Signal Strength</p>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-grow h-1.5 bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${Math.max(0, 100 + doorState.rssi)}%` }} />
                                        </div>
                                        <span className="text-sm font-black text-white tabular-nums">{doorState.rssi} <span className="text-[9px] text-slate-500">dBm</span></span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Last Activity</p>
                                    <div className="flex items-center gap-2 text-white font-bold tracking-tight">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                        {doorState.lastActivity ? doorState.lastActivity.toLocaleTimeString() : '--:--'}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Last Command</p>
                                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5 border border-white/5 w-fit">
                                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="text-xs font-bold text-slate-300">{doorState.lastCommand}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Controls Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <button
                            onClick={() => handleAction('Unlock', apiService.unlockDoor)}
                            disabled={doorState.loading || !doorState.isOnline || !doorState.isLocked}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:grayscale p-6 md:p-8 rounded-[2rem] md:rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300 shadow-xl"
                        >
                            <Unlock className="w-8 h-8 md:w-10 md:h-10 text-white" />
                            <span className="text-base md:text-lg font-black text-white tracking-tighter uppercase whitespace-nowrap">Unlock Door</span>
                        </button>

                        <button
                            onClick={() => handleAction('Lock', apiService.lockDoor)}
                            disabled={doorState.loading || !doorState.isOnline || doorState.isLocked}
                            className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:grayscale p-6 md:p-8 rounded-[2rem] md:rounded-3xl border border-white/10 flex flex-col items-center justify-center gap-4 transition-all duration-300 shadow-xl"
                        >
                            <Lock className="w-8 h-8 md:w-10 md:h-10 text-white" />
                            <span className="text-base md:text-lg font-black text-white tracking-tighter uppercase whitespace-nowrap">Relock Door</span>
                        </button>

                        <button
                            onClick={() => setShowEmergencyModal(true)}
                            className="bg-red-600/10 hover:bg-red-600 border border-red-500/30 text-red-500 hover:text-white p-6 md:p-8 rounded-[2rem] md:rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-500 shadow-xl"
                        >
                            <AlertTriangle className="w-8 h-8 md:w-10 md:h-10" />
                            <span className="text-base md:text-lg font-black tracking-tighter uppercase whitespace-nowrap">Emergency</span>
                        </button>
                    </div>

                    {/* Diagnostics and Tools */}
                    <div className={SECTION_STYLE}>
                        <div className="flex items-center gap-3 mb-8">
                            <Zap className="w-5 h-5 text-amber-400" />
                            <h2 className="text-xl font-black text-white tracking-tight">Hardware Diagnostics</h2>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[{ name: 'Test Relay', icon: RotateCcw, color: 'text-indigo-400', api: apiService.testRelay },
                                { name: 'Refresh Status', icon: RefreshCw, color: 'text-blue-400', api: fetchStatus },
                                { name: 'Ping Hardware', icon: Bluetooth, color: 'text-emerald-400', api: () => apiService.getBleStatus() },
                                { name: 'System Reset', icon: Zap, color: 'text-rose-400', api: () => showAlert('info', 'Reset request sent to service.') }
                            ].map((tool, i) => 
                                tool.api && (
                                    <button key={i} onClick={tool.api} className="flex flex-col items-center gap-3 p-4 md:p-6 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group">
                                        <tool.icon className={`w-5 h-5 md:w-6 md:h-6 ${tool.color} group-hover:scale-110 transition-transform`} />
                                        <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{tool.name}</span>
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Scanner & Logs */}
                <div className="xl:col-span-4 space-y-8">

                    {/* Device Scanner */}
                    <div className={SECTION_STYLE}>
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Search className="w-5 h-5 text-blue-400" />
                                <h2 className="text-xl font-black text-white tracking-tight">BLE Scanner</h2>
                            </div>
                            <button
                                onClick={startScan}
                                disabled={isScanning}
                                className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-500 hover:text-white transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                            {isScanning ? (
                                <div className="py-12 flex flex-col items-center gap-4 border border-dashed border-white/10 rounded-2xl">
                                    <RotateCcw className="w-8 h-8 text-blue-500 animate-spin" />
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scanning Airspace...</p>
                                </div>
                            ) : scanResults.length > 0 ? scanResults.map((d, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-blue-500/30 group transition-all">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                            <Bluetooth className="w-4 h-4 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-white truncate max-w-[120px]">{d.name}</p>
                                            <p className="text-[9px] font-mono text-slate-500">{d.address}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-[10px] font-bold tabular-nums ${d.rssi > -70 ? 'text-emerald-400' : 'text-amber-400'}`}>{d.rssi} dB</span>
                                        <button
                                            onClick={() => handleConnection(d.address === deviceInfo.mac ? 'connect' : 'scan')}
                                            disabled={isConnecting}
                                            className="text-[9px] font-black uppercase text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {d.address === deviceInfo.mac ? 'Connect' : 'Pair'}
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="py-12 flex flex-col items-center gap-2 text-slate-500 italic text-xs">
                                    <Info className="w-5 h-5 opacity-20" />
                                    <span>No devices found nearby.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Live Event Feed */}
                    <div className={SECTION_STYLE}>
                        <div className="flex items-center gap-3 mb-8">
                            <History className="w-5 h-5 text-indigo-400" />
                            <h2 className="text-xl font-black text-white tracking-tight">Live Event Feed</h2>
                        </div>
                        <div className="space-y-6">
                            {logs.slice(0, 6).map((log, i) => (
                                <div key={i} className="flex items-start gap-4 group">
                                    <div className={`w-1 h-10 rounded-full flex-shrink-0 transition-all ${log.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    <div className="flex-grow">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-black text-white truncate max-w-[150px] tracking-tight">{log.employees?.name || 'Unknown User'}</span>
                                            <span className="text-[10px] font-bold text-slate-600 tabular-nums">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${log.method === 'face' ? 'text-blue-400' : 'text-purple-400'}`}>{log.method || 'Manual'}</span>
                                            <span className="text-[8px] text-slate-600 font-bold">•</span>
                                            <span className="text-[9px] text-slate-500 font-medium">Confidence: {((log.confidence || 0) * 100).toFixed(0)}%</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => window.location.href = '/logs'} className="w-full mt-10 py-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-all">View All Audit Logs</button>
                    </div>
                </div>
            </div>

            {/* Emergency Confirmation Modal */}
            {showEmergencyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-red-500/30 rounded-[2.5rem] p-10 max-w-md w-full shadow-[0_0_100px_rgba(239,68,68,0.2)] animate-in zoom-in-95 duration-300">
                        <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-8 mx-auto">
                            <AlertTriangle className="w-10 h-10" />
                        </div>
                        <h3 className="text-3xl font-black text-white text-center tracking-tighter mb-4">Confirm Emergency Unlock</h3>
                        <p className="text-slate-400 text-center text-sm leading-relaxed mb-10 font-medium">
                            This action will bypass all security protocols and force the relay to unlock permanently until manually reset. This event will be logged as a <span className="text-red-400 font-bold underline">CRITICAL ALERT</span>.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setShowEmergencyModal(false)}
                                className="py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-xs transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    handleAction('Emergency Unlock', apiService.unlockDoor);
                                    setShowEmergencyModal(false);
                                }}
                                className="py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-xs transition-all shadow-xl"
                            >
                                Execute
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
