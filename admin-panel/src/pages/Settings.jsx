import React from 'react';
import { Settings as SettingsIcon, Bell, Lock, Database, Globe, ChevronRight } from 'lucide-react';

export default function Settings() {
    const sections = [
        { label: 'Security Protocols', desc: 'Neural threshold management and biometric sensitivity.', icon: Lock, status: 'Enabled' },
        { label: 'System Preferences', desc: 'Customize dashboard aesthetics and notification levels.', icon: SettingsIcon, status: 'Default' },
        { label: 'Cloud Infrastructure', desc: 'Manage Supabase connection pools and data retention.', icon: Database, status: 'Connected' },
        { label: 'External Access', desc: 'Secure webhooks and API integration nodes.', icon: Globe, status: 'Inactive' },
    ];

    return (
        <div className="space-y-8 max-w-4xl">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">System Configuration</h1>
                <p className="text-slate-400 text-sm">Manage global security parameters and interface behavior settings.</p>
            </div>

            {/* Settings List */}
            <div className="space-y-4">
                {sections.map((item, i) => (
                    <div key={i} className="card hover:border-white/10 transition-all flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-6">
                            <div className="w-12 h-12 rounded-xl bg-[#111827] border border-white/5 flex items-center justify-center text-slate-500 group-hover:text-blue-500 group-hover:border-blue-500/20 transition-all">
                                <item.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white mb-0.5">{item.label}</h3>
                                <p className="text-xs text-slate-500 font-medium">{item.desc}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-widest ${item.status === 'Connected' || item.status === 'Enabled'
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-slate-800 text-slate-500'
                                }`}>
                                {item.status}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                ))}
            </div>

            {/* Advanced Section */}
            <div className="card bg-blue-600/5 border-blue-600/10 !p-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-lg font-bold text-white mb-1">Backup & Restore</h2>
                        <p className="text-xs text-slate-400 font-medium max-w-md">
                            Generate a cryptic backup of your identity registry and security audit logs. Recommended every 30 days.
                        </p>
                    </div>
                    <button className="btn-primary whitespace-nowrap shadow-xl shadow-blue-600/10">
                        Create Snapshot
                    </button>
                </div>
            </div>
        </div>
    );
}
