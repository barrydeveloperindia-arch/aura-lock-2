import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, Lock } from 'lucide-react';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-[#0f172a] text-slate-300">
            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#111827]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-40">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <Lock className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="font-bold text-white text-xl tracking-tight">Aura<span className="text-blue-500">Lock</span></h1>
                </div>
                <button 
                    onClick={() => setSidebarOpen(true)} 
                    className="p-2 -mr-2 text-slate-400 hover:text-white active:scale-95 transition-all rounded-xl hover:bg-white/5"
                    aria-label="Open menu"
                >
                    <Menu className="w-6 h-6" />
                </button>
            </header>

            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity animate-in fade-in duration-300"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content Area */}
            <main className="flex-1 w-full min-w-0 md:ml-[240px] pt-20 p-4 md:p-10 md:pt-10 overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
