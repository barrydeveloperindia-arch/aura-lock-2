import React from 'react';
import { NavLink } from 'react-router-dom';
import { apiService } from '../services/api';
import BrandLogo from './BrandLogo';
import {
    LayoutDashboard,
    UserPlus,
    Users,
    ClipboardList,
    Settings,
    Lock,
    LogOut,
    Shield,
    Key,
    MapPin,
    ScanFace,
    X
} from 'lucide-react';

const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { name: 'Employees', icon: Users, path: '/admin/users' },
    { name: 'Attendance', icon: ClipboardList, path: '/admin/attendance' },
    { name: 'Live Map', icon: MapPin, path: '/admin/live-map' },
    { name: 'Reports', icon: Shield, path: '/admin/reports' },
    { name: 'Access Logs', icon: ClipboardList, path: '/admin/logs' },
    { name: 'Door Control', icon: Key, path: '/admin/door-control' },
    { name: 'Face Calibration', icon: ScanFace, path: '/admin/face-calibration' },
    { name: 'Settings', icon: Settings, path: '/admin/settings' },
];

export default function Sidebar({ isOpen, onClose }) {
    const user = JSON.parse(localStorage.getItem('aura_user') || '{}');

    return (
        <aside className={`fixed left-0 top-0 bottom-0 w-[260px] bg-white border-r border-slate-200 flex flex-col z-50 transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'} shadow-[4px_0_24px_rgba(0,0,0,0.02)]`}>
            {/* Logo Section */}
            <div className="px-5 pt-6 pb-4 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <BrandLogo className="h-11 w-auto shrink-0" />
                    <div className="flex flex-col min-w-0 border-l border-slate-200 pl-3">
                        <span className="font-display font-bold text-brand-ink text-[13px] leading-tight truncate">Attendance Tracker</span>
                        <span className="text-[10px] font-semibold text-slate-400 tracking-wide">Admin Console</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="md:hidden p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 active:scale-95 transition-all"
                    aria-label="Close menu"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-2 space-y-1.5 overflow-y-auto">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) => `
                            flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 group font-semibold text-[13px]
                            ${isActive
                                ? 'bg-brand-navy/[0.07] text-brand-navy shadow-sm'
                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                            }
                        `}
                    >
                        <item.icon className={`w-5 h-5 transition-colors ${item.name === 'Face Register' ? 'animate-pulse' : ''}`} />
                        <span>{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Bottom Section: User Info & Logout */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center font-bold text-brand-navy text-sm shadow-sm">
                        {user.name?.charAt(0) || 'A'}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-900 truncate">{user.name || 'Admin'}</div>
                        <div className="text-[11px] font-medium text-slate-500 truncate">System Administrator</div>
                    </div>
                </div>
                <button
                    onClick={() => apiService.logout()}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all text-xs font-bold"
                >
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>
        </aside>
    );
}
