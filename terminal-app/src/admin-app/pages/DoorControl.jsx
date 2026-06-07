import React, { useState, useEffect, useCallback } from 'react';
import {
    Lock, Unlock, Shield, Activity, History,
    AlertCircle, Clock, Key, CheckCircle2, Wifi, WifiOff, Server, RefreshCw,
    Search, Bluetooth, Zap, RotateCcw, AlertTriangle, Info, MonitorCheck,
    Signal, Radio, Loader2, ScanFace
} from 'lucide-react';
import { format } from 'date-fns';
import { apiService } from '../services/api';

const SECTION_STYLE = "bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-xl shadow-slate-200/50 overflow-hidden relative group transition-all duration-500 hover:shadow-2xl hover:border-blue-200";

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
    const [deviceInfo, setDeviceInfo] = useState({ name: 'EngLabs Attendance Terminal', mac: '58:8C:81:CC:65:29' });
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
            const status = await apiService.getDoorStatus ? await apiService.getDoorStatus() : await apiService.getBleStatus();
            setDoorState(prev => ({
                ...prev,
                isOnline: status.online !== undefined ? status.online : true,
                isConnected: status.isConnected !== undefined ? status.isConnected : true,
                isLocked: status.isLocked !== undefined ? status.isLocked : prev.isLocked,
                rssi: status.rssi || -65,
                lastActivity: new Date()
            }));
            if (status.mac) setDeviceInfo(prev => ({ ...prev, name: status.name || prev.name, mac: status.mac }));
        } catch (e) {
            setDoorState(prev => ({ ...prev, isOnline: false }));
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        fetchLogs();
        
        const interval = setInterval(() => {
            fetchStatus();
            fetchLogs();
        }, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus, fetchLogs]);

    const handleAction = async (action, apiCall) => {
        setDoorState(prev => ({ ...prev, loading: true, lastCommand: action }));
        try {
            const res = await apiCall();
            if (res.success) {
                showAlert('success', res.message || `${action} action completed.`);
                if (action.includes('Unlock')) {
                    setDoorState(prev => ({ ...prev, isLocked: false }));
                } else if (action === 'Lock') {
                    setDoorState(prev => ({ ...prev, isLocked: true }));
                }
                fetchLogs();
            } else {
                showAlert('error', res.message || `Failed to ${action.toLowerCase()}.`);
            }
        } catch (e) {
            console.error(`Action failed: ${action}`, e);
            const errorMsg = e.response?.data?.message || e.message || 'Unknown communication error';
            showAlert('error', `${action} Error: ${errorMsg}`);
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

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700 p-4 md:p-0">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight">Door Manager <span className="text-blue-600">v2.5</span></h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">Remote Hardware Command Center</p>
                        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest
                            ${doorState.isConnected ? 'bg-emerald-500/10 border-emerald-200 text-emerald-600' :
                                doorState.isOnline ? 'bg-blue-500/10 border-blue-200 text-blue-600' :
                                    'bg-red-500/10 border-red-200 text-red-600'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${doorState.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                            {doorState.isConnected ? 'SYSTEM CONNECTED' : 'HARDWARE OFFLINE'}
                        </div>
                    </div>
                </div>
                
                <button 
                    onClick={fetchStatus}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50 hover:border-blue-400 hover:text-blue-600 transition-all shadow-sm"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${doorState.loading ? 'animate-spin' : ''}`} />
                    Refresh Status
                </button>
            </div>

            {/* Alert Notification */}
            {alert && (
                <div className={`fixed bottom-8 right-8 z-[100] p-5 rounded-[2rem] flex items-center gap-4 border shadow-2xl animate-in fade-in slide-in-from-bottom-8 
                    ${alert.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${alert.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                        {alert.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">System Alert</p>
                        <span className="text-sm font-black tracking-tight">{alert.message}</span>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* LEFT COLUMN */}
                <div className="xl:col-span-8 space-y-8">

                    {/* Main Status Card */}
                    <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-[3rem] p-8 md:p-12 shadow-2xl relative overflow-hidden group">
                        {/* Decorative Background Elements */}
                        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />
                        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />
                        
                        <div className="relative z-10 flex flex-col lg:flex-row gap-12 items-center">
                            {/* Visual Lock Circle */}
                            <div className="relative flex-shrink-0 group/lock">
                                <div className={`w-48 h-48 md:w-64 md:h-64 rounded-full flex items-center justify-center border-[8px] transition-all duration-1000 relative
                                    ${doorState.isLocked
                                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                                        : 'bg-emerald-50 border-emerald-500/20 text-emerald-500 shadow-[0_0_100px_rgba(16,185,129,0.2)]'}`}>
                                    
                                    {/* Animated Ring */}
                                    {!doorState.isLocked && (
                                        <div className="absolute inset-0 rounded-full border-2 border-emerald-500/40 animate-ping opacity-20" />
                                    )}
                                    
                                    <div className="flex flex-col items-center">
                                        {doorState.isLocked ? <Lock className="w-16 h-16 md:w-24 md:h-24 mb-2" /> : <Unlock className="w-16 h-16 md:w-24 md:h-24 mb-2" />}
                                        <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] 
                                            ${doorState.isLocked ? 'bg-slate-200 text-slate-600' : 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'}`}>
                                            {doorState.isLocked ? 'Locked' : 'Unlocked'}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Status Indicator Badge */}
                                <div className="absolute top-4 right-4 w-12 h-12 rounded-2xl bg-white border border-slate-100 shadow-xl flex items-center justify-center">
                                    <Bluetooth className={`w-5 h-5 ${doorState.isConnected ? 'text-blue-500' : 'text-slate-300'}`} />
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="flex-grow space-y-10 w-full">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <MonitorCheck className="w-3 h-3" /> Target Device
                                        </p>
                                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">{deviceInfo.name}</h3>
                                        <code className="mt-2 inline-block font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                                            {deviceInfo.mac}
                                        </code>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <Signal className="w-3 h-3" /> Connection Strength
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-grow h-3 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                                                <div className={`h-full transition-all duration-1000 rounded-full shadow-lg
                                                    ${doorState.rssi > -60 ? 'bg-emerald-500' : doorState.rssi > -80 ? 'bg-amber-500' : 'bg-red-500'}`} 
                                                    style={{ width: `${Math.max(5, 100 + doorState.rssi)}%` }} 
                                                />
                                            </div>
                                            <span className="text-lg font-black text-slate-900 tabular-nums">{doorState.rssi} <span className="text-[10px] text-slate-400">dBm</span></span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-8 border-t border-slate-100">
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Last Sync</p>
                                        <div className="flex items-center gap-2 text-slate-700 font-black text-sm">
                                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                                            {doorState.lastActivity ? format(doorState.lastActivity, 'hh:mm:ss a') : '--:--:--'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Last Cmd</p>
                                        <div className="flex items-center gap-2 text-slate-700 font-black text-sm">
                                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                                            {doorState.lastCommand}
                                        </div>
                                    </div>
                                    <div className="hidden md:block">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                                        <div className="flex items-center gap-2 text-slate-700 font-black text-sm">
                                            <div className={`w-2 h-2 rounded-full ${doorState.isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                            {doorState.isConnected ? 'Operational' : 'Error'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Primary Action Buttons */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* MAIN REMOTE OPEN BUTTON */}
                        <button
                            onClick={() => handleAction('Remote Unlock', apiService.unlockDoor)}
                            disabled={doorState.loading || !doorState.isConnected || !doorState.isLocked}
                            className="relative group/btn overflow-hidden bg-blue-600 disabled:bg-slate-200 p-8 md:p-12 rounded-[3.5rem] shadow-2xl shadow-blue-200 transition-all duration-500 hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-700 opacity-100 group-hover/btn:scale-110 transition-transform duration-700" />
                            <div className="relative z-10 flex flex-col items-center gap-6">
                                <div className="w-20 h-20 rounded-[2rem] bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl">
                                    <Unlock className="w-10 h-10" />
                                </div>
                                <div className="text-center">
                                    <h4 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">Remote Open</h4>
                                    <p className="text-blue-100/60 text-[10px] font-black uppercase tracking-widest">Admin Authorization Required</p>
                                </div>
                            </div>
                            {doorState.loading && (
                                <div className="absolute inset-0 bg-blue-600/90 backdrop-blur-sm flex items-center justify-center z-20">
                                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                                </div>
                            )}
                        </button>

                        {/* RELOCK BUTTON */}
                        <button
                            onClick={() => handleAction('Lock', apiService.lockDoor)}
                            disabled={doorState.loading || !doorState.isConnected || doorState.isLocked}
                            className="relative group/btn overflow-hidden bg-slate-900 disabled:bg-slate-200 p-8 md:p-12 rounded-[3.5rem] shadow-2xl shadow-slate-200 transition-all duration-500 hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
                        >
                            <div className="relative z-10 flex flex-col items-center gap-6">
                                <div className="w-20 h-20 rounded-[2rem] bg-white/10 flex items-center justify-center text-white">
                                    <Lock className="w-10 h-10" />
                                </div>
                                <div className="text-center">
                                    <h4 className="text-2xl font-black text-white tracking-tighter uppercase mb-1">Force Lock</h4>
                                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Secure Hardware Relay</p>
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Secondary Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* EMERGENCY PANEL */}
                        <div className="bg-red-50 border border-red-100 rounded-[2.5rem] p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center text-red-600">
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Security Override</h3>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowEmergencyModal(true)}
                                className="w-full py-5 rounded-2xl bg-red-600 text-white font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all shadow-xl shadow-red-200 active:scale-95"
                            >
                                Emergency Open
                            </button>
                        </div>

                        {/* DIAGNOSTICS */}
                        <div className={SECTION_STYLE}>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight mb-8">System Tools</h3>
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { icon: RotateCcw, label: 'Test Relay', api: apiService.testRelay },
                                    { icon: Radio, label: 'Ping HW', api: fetchStatus },
                                    { icon: Zap, label: 'Reset', api: () => showAlert('info', 'Hardware reset requested.') }
                                ].map((tool, i) => (
                                    <button key={i} onClick={tool.api} className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-blue-50 hover:border-blue-200 group transition-all">
                                        <tool.icon className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{tool.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Event Log */}
                <div className="xl:col-span-4 space-y-8">
                    <div className={SECTION_STYLE}>
                        <div className="flex items-center justify-between mb-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                    <History className="w-5 h-5" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Recent Activity</h2>
                            </div>
                        </div>

                        <div className="space-y-8 relative">
                            {/* Connector Line */}
                            <div className="absolute left-[1.125rem] top-2 bottom-2 w-0.5 bg-slate-100" />

                            {logs.slice(0, 8).map((log, i) => (
                                <div key={i} className="flex items-start gap-4 relative z-10 group">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all group-hover:scale-110 
                                        ${log.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : 'bg-red-50 border-red-100 text-red-500'}`}>
                                        {log.method === 'remote' ? <MonitorCheck className="w-4 h-4" /> : <ScanFace className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-grow pt-0.5">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-black text-slate-800 tracking-tight">{log.employees?.name || 'Unknown User'}</span>
                                            <span className="text-[10px] font-black text-slate-400 tabular-nums uppercase">{format(new Date(log.created_at), 'hh:mm a')}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${log.method === 'face' ? 'text-blue-500' : log.method === 'remote' ? 'text-indigo-500' : 'text-slate-500'}`}>
                                                {log.method || 'Unknown'}
                                            </span>
                                            <div className="w-1 h-1 rounded-full bg-slate-200" />
                                            <span className={`text-[9px] font-black uppercase tracking-widest ${log.status === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {log.status === 'success' ? 'Granted' : 'Denied'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {logs.length === 0 && (
                                <div className="py-20 text-center text-slate-400">
                                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                    <p className="text-xs font-black uppercase tracking-widest">No Recent Activity</p>
                                </div>
                            )}
                        </div>

                        <button onClick={() => window.location.href = '/logs'} className="w-full mt-10 py-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-slate-900 hover:text-white text-[10px] font-black text-slate-500 uppercase tracking-widest transition-all shadow-sm">
                            Full Audit Log
                        </button>
                    </div>
                </div>
            </div>

            {/* Emergency Modal */}
            {showEmergencyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-500">
                    <div className="bg-white border border-red-100 rounded-[3.5rem] p-10 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-500">
                        <div className="w-24 h-24 rounded-[2.5rem] bg-red-50 border border-red-100 flex items-center justify-center text-red-600 mb-8 mx-auto shadow-inner">
                            <AlertTriangle className="w-12 h-12" />
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 text-center tracking-tighter mb-4 italic">Security Override!</h3>
                        <p className="text-slate-500 text-center text-sm leading-relaxed mb-10 font-black uppercase tracking-tight opacity-70">
                            WARNING: This will force the hardware relay to open. This event is <span className="text-red-600 underline">Logged Permanently</span>.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setShowEmergencyModal(false)}
                                className="py-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-black uppercase tracking-widest text-[10px] transition-all"
                            >
                                Abort
                            </button>
                            <button
                                onClick={() => {
                                    handleAction('Emergency Unlock', apiService.unlockDoor);
                                    setShowEmergencyModal(false);
                                }}
                                className="py-5 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-red-200"
                            >
                                Confirm Open
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
