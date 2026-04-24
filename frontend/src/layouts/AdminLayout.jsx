
import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Server, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../store/AuthContext';

export default function AdminLayout() {
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const navItems = [
        { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
        { path: '/admin/users', label: 'Users', icon: Users },
        { path: '/admin/logs', label: 'Access Logs', icon: FileText },
        { path: '/admin/devices', label: 'Devices', icon: Server },
    ];

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-6 flex items-center gap-3 border-b border-slate-800">
                    <Shield className="w-8 h-8 text-blue-500" />
                    <span className="font-bold text-xl tracking-wider">SECURE<span className="text-blue-500">ADMIN</span></span>
                </div>

                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/admin'} // Exact match for dashboard
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-slate-400 hover:bg-red-900/20 hover:text-red-400 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">Sign Out</span>
                    </button>
                    <div className="mt-4 px-2 text-xs text-slate-600 text-center">
                        v1.0.0 &bull; SecureCorp
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto bg-slate-950 p-8">
                <Outlet />
            </main>
        </div>
    );
}
