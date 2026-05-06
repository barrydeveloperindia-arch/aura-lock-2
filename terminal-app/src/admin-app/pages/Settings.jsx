import React, { useState } from 'react';
import { 
    Settings as SettingsIcon, Bell, Lock, Database, Globe, ChevronRight, 
    Cpu, ShieldCheck, Wifi, RefreshCw, Trash2, Save, HardDrive, 
    UserCheck, Fingerprint, Zap
} from 'lucide-react';
import { apiService } from '../services/api';

const CARD_STYLE = "bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all duration-300";
const ICON_BOX = "w-12 h-12 rounded-2xl flex items-center justify-center mb-4 shadow-inner";

export default function Settings() {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState({
        deviceName: 'AuraLock Main Terminal',
        macAddress: '58:8C:81:CC:65:29',
        faceThreshold: 0.55,
        livenessDetection: true,
        autoSyncLogs: true,
        retentionDays: 30,
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
    });

    const handleSave = () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            alert('Settings saved successfully (Local Update)');
        }, 800);
    };

    const rebuildCache = async () => {
        if (!confirm('Rebuild biometric cache? This will refresh all face templates.')) return;
        setLoading(true);
        try {
            const res = await apiService.rebuildCache();
            alert(res.message || 'Cache rebuild complete.');
        } catch (e) { alert('Rebuild failed: ' + (e.response?.data?.message || e.message)); }
        finally { setLoading(false); }
    };

    const clearLogs = async () => {
        if (!confirm('ARE YOU SURE? This will permanently delete all audit logs.')) return;
        setLoading(true);
        try {
            const res = await apiService.clearLogs();
            alert(`Logs cleared successfully!`);
        } catch (e) { alert(`Failed to clear logs! Error: ${e.response?.status || e.message}`); }
        finally { setLoading(false); }
    };

    const [adminCreds, setAdminCreds] = useState({ email: '', password: '' });
    const updateAdmin = async () => {
        if (!adminCreds.email && !adminCreds.password) return alert('Please enter new email or password.');
        setLoading(true);
        try {
            const res = await apiService.updateAdminCredentials(adminCreds.email, adminCreds.password);
            alert(`Success! Message: ${res.message}`);
            setAdminCreds({ email: '', password: '' });
        } catch (e) { 
            alert(`Failed! Error: ${e.response?.status || e.message}`); 
        }
        finally { setLoading(false); }
    };

    return (
        <div className="max-w-[1200px] mx-auto space-y-10 pb-20 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">System Configuration</h1>
                    <p className="text-slate-500 font-medium">Manage terminal hardware, biometric sensitivity, and security parameters.</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-50"
                >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Config
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                
                {/* Admin Account Section */}
                <div className={CARD_STYLE}>
                    <div className={`${ICON_BOX} bg-purple-50 text-purple-600`}>
                        <UserCheck className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-6 uppercase tracking-tight">Admin Security</h3>
                    
                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">New Admin Email</label>
                            <input 
                                type="email" 
                                placeholder="Change email..."
                                value={adminCreds.email}
                                onChange={(e) => setAdminCreds({...adminCreds, email: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">New Password</label>
                            <input 
                                type="password" 
                                placeholder="••••••••"
                                value={adminCreds.password}
                                onChange={(e) => setAdminCreds({...adminCreds, password: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-500 transition-all"
                            />
                        </div>
                        <button 
                            onClick={updateAdmin}
                            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest"
                        >
                            Update Credentials
                        </button>
                    </div>
                </div>

                {/* Hardware Section */}
                <div className={CARD_STYLE}>
                    <div className={`${ICON_BOX} bg-blue-50 text-blue-600`}>
                        <Cpu className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-6 uppercase tracking-tight">Hardware Control</h3>
                    
                    <div className="space-y-5">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Device Identifier</label>
                            <input 
                                type="text" 
                                value={settings.deviceName}
                                onChange={(e) => setSettings({...settings, deviceName: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Lock MAC Address</label>
                            <input 
                                type="text" 
                                value={settings.macAddress}
                                onChange={(e) => setSettings({...settings, macAddress: e.target.value})}
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-mono text-[11px] font-black text-blue-600 focus:outline-none focus:border-blue-500 transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Biometrics Section */}
                <div className={CARD_STYLE}>
                    <div className={`${ICON_BOX} bg-emerald-50 text-emerald-600`}>
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 mb-6 uppercase tracking-tight">Security & AI</h3>
                    
                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Face Match Sensitivity</label>
                                <span className="text-xs font-black text-emerald-600">{settings.faceThreshold}</span>
                            </div>
                            <input 
                                type="range" min="0.30" max="0.70" step="0.01"
                                value={settings.faceThreshold}
                                onChange={(e) => setSettings({...settings, faceThreshold: parseFloat(e.target.value)})}
                                className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <div className="flex justify-between mt-1">
                                <span className="text-[9px] font-black text-slate-300 uppercase">Speed</span>
                                <span className="text-[9px] font-black text-slate-300 uppercase">Security</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-3">
                                <Zap className="w-4 h-4 text-amber-500" />
                                <span className="text-xs font-black text-slate-700">Liveness Check</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={settings.livenessDetection} onChange={(e) => setSettings({...settings, livenessDetection: e.target.checked})} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Maintenance Section */}
                <div className="xl:col-span-2 bg-slate-900 rounded-[2.5rem] p-8 md:p-10 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-blue-500/20 transition-all duration-1000" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                            <div className="w-16 h-16 rounded-3xl bg-white/10 flex items-center justify-center text-white shadow-xl">
                                <HardDrive className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tight mb-1 uppercase italic">Database Maintenance</h3>
                                <p className="text-slate-400 text-sm font-medium">Rebuild local biometric templates and clear expired logs.</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <button 
                                onClick={rebuildCache}
                                className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                            >
                                Rebuild Cache
                            </button>
                            <button 
                                onClick={clearLogs}
                                className="px-6 py-4 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/20 text-red-400 font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                            >
                                Clear Audit Logs
                            </button>
                        </div>
                    </div>
                </div>

                {/* Advanced Info */}
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 shadow-2xl shadow-indigo-200">
                    <div className="flex items-center gap-3 mb-6">
                        <Database className="w-6 h-6 text-white/50" />
                        <h4 className="text-white font-black uppercase tracking-widest text-xs">Cloud Metadata</h4>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-white/60 text-[10px] font-black uppercase tracking-wider">
                            <span>Central URL</span>
                            <span className="text-white truncate max-w-[150px]">{settings.apiBaseUrl}</span>
                        </div>
                        <div className="flex justify-between items-center text-white/60 text-[10px] font-black uppercase tracking-wider">
                            <span>Token Expiry</span>
                            <span className="text-white">24h Rolling</span>
                        </div>
                        <div className="flex justify-between items-center text-white/60 text-[10px] font-black uppercase tracking-wider">
                            <span>Encryption</span>
                            <span className="text-white">AES-256-GCM</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
