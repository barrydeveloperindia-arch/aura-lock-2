import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, Lock } from 'lucide-react';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex w-full max-w-full h-screen bg-[#f8fafc] text-slate-800 font-sans overflow-hidden">
            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/90 backdrop-blur-lg border-b border-slate-200 flex items-center justify-between px-6 z-40 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <Lock className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="font-bold text-slate-900 text-xl tracking-tight">Aura<span className="text-emerald-500">Lock</span></h1>
                </div>
                <button 
                    onClick={() => setSidebarOpen(true)} 
                    className="p-2 -mr-2 text-slate-500 hover:text-emerald-600 active:scale-95 transition-all rounded-xl hover:bg-slate-100"
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
            <main className="flex-1 w-full max-w-[100vw] min-w-0 md:ml-[260px] pt-20 p-4 md:p-10 md:pt-10 overflow-y-auto">
                <div className="max-w-[100vw] mx-auto w-full overflow-x-hidden sm:overflow-visible">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
