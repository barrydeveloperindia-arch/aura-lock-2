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
                        <svg className="w-5 h-5 text-white" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50 10C27.9 10 10 27.9 10 50C10 72.1 27.9 90 50 90C72.1 90 90 72.1 90 50" stroke="currentColor" strokeWidth="12" strokeLinecap="round"/>
                            <path d="M30 50C30 39 39 30 50 30C61 30 70 39 70 50C70 61 61 70 50 70" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
                            <circle cx="50" cy="50" r="10" fill="currentColor"/>
                        </svg>
                    </div>
                    <h1 className="font-bold text-slate-900 text-base tracking-tight">EngLabs <span className="text-emerald-500">Attendance</span></h1>
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
