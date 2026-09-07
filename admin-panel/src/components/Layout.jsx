import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react';
import BrandLogo from './BrandLogo';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[#f8fafc] text-slate-800 font-sans">
            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-lg border-b border-slate-200 flex items-center justify-between px-6 z-40 shadow-sm">
                <div className="flex items-center gap-3">
                    <BrandLogo className="h-9 w-auto" />
                    <span className="font-display font-bold text-brand-ink text-sm">Attendance Tracker</span>
                </div>
                <button 
                    onClick={() => setSidebarOpen(true)} 
                    className="p-2 -mr-2 text-slate-500 hover:text-brand-navy active:scale-95 transition-all rounded-xl hover:bg-slate-100"
                    aria-label="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </header>

            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden transition-opacity animate-in fade-in duration-300"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content Area */}
            <main className="flex-1 w-full min-w-0 md:ml-[260px] pt-20 p-4 md:p-10 md:pt-10 overflow-y-auto">
                <div className="max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
