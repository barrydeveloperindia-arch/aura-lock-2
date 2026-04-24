import React from 'react';
import { NavLink } from 'react-router-dom';
import { apiService } from '../services/api';
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
    X
} from 'lucide-react';

const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { name: 'Employees', icon: Users, path: '/admin/users' },
    { name: 'Attendance', icon: ClipboardList, path: '/admin/attendance' },
    { name: 'Reports', icon: Shield, path: '/admin/reports' },
    { name: 'Access Logs', icon: ClipboardList, path: '/admin/logs' },
    { name: 'Door Control', icon: Key, path: '/admin/door-control' },
    { name: 'Settings', icon: Settings, path: '/admin/settings' },
];

export default function Sidebar({ isOpen, onClose }) {
    const user = JSON.parse(localStorage.getItem('aura_user') || '{}');

    return (
        <aside className={`fixed left-0 top-0 bottom-0 w-[240px] bg-[#111827] border-r border-white/5 flex flex-col z-50 transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            {/* Logo Section */}
            <div className="p-6 mb-2 flex items-center justify-between md:justify-start">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <Lock className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="font-bold text-white tracking-tight text-2xl">
                        Aura<span className="text-blue-500">Lock</span>
                    </h1>
                </div>
                <button 
                    onClick={onClose} 
                    className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 active:scale-95 transition-all"
                    aria-label="Close menu"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) => `
                            flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group
                            ${isActive
                                ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20'
                                : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            }
                        `}
                    >
                        <item.icon className={`w-5 h-5 ${item.name === 'Face Register' ? 'animate-pulse' : ''}`} />
                        <span className="font-semibold text-sm">{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Bottom Section: User Info & Logout */}
            <div className="p-4 border-t border-white/5 bg-[#0f172a]/50">
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-slate-400 text-xs">
                        {user.name?.charAt(0) || 'A'}
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{user.name || 'Admin'}</div>
                        <div className="text-[10px] text-slate-500 truncate">System Administrator</div>
                    </div>
                </div>
                <button
                    onClick={() => apiService.logout()}
                    className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-xs font-semibold"
                >
                    <LogOut className="w-4 h-4" /> Sign Out
                </button>
            </div>
        </aside>
    );
}
