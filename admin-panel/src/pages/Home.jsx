import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanFace, ShieldCheck, ArrowRight } from 'lucide-react';
import { motion as Motion } from 'framer-motion';
import BrandLogo from '../components/BrandLogo';
import pkg from '../../package.json';

const YEAR = new Date().getFullYear();

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-brand-slate text-slate-800 flex flex-col font-sans">
            {/* Top bar */}
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <BrandLogo className="h-12 w-auto" />
                        <div className="border-l border-slate-200 pl-4 hidden sm:block">
                            <div className="font-display font-bold text-brand-ink leading-tight">Attendance Tracker</div>
                            <div className="text-[11px] font-semibold text-slate-500">Terminal &amp; admin access</div>
                        </div>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400 tracking-wide">v{pkg.version}</span>
                </div>
            </header>

            {/* Choice */}
            <main className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-4xl">
                    <Motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
                        <h1 className="font-display text-3xl md:text-4xl font-bold text-brand-ink" style={{ textWrap: 'balance' }}>
                            Welcome to Englabs Attendance
                        </h1>
                        <p className="mt-3 text-slate-500 max-w-xl mx-auto">
                            Choose the terminal to mark attendance with face recognition, or open the admin console to manage staff, records and door access.
                        </p>
                    </Motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Motion.button
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => navigate('/scanner')}
                            className="group text-left p-7 md:p-8 rounded-2xl bg-white border border-slate-200 hover:border-brand-teal shadow-sm hover:shadow-lg hover:shadow-brand-teal/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                        >
                            <div className="w-14 h-14 rounded-xl bg-brand-teal/15 flex items-center justify-center mb-5">
                                <ScanFace size={28} className="text-brand-teal-dark" />
                            </div>
                            <h2 className="font-display text-xl font-bold text-brand-ink mb-1.5">Attendance terminal</h2>
                            <p className="text-sm text-slate-500 leading-relaxed">Face scan to check in or out. Photo, time and location are recorded automatically.</p>
                            <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-teal-dark">
                                Start scanner <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <div className="mt-3 text-[11px] font-semibold text-slate-400">No login needed</div>
                        </Motion.button>

                        <Motion.button
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => navigate('/admin')}
                            className="group text-left p-7 md:p-8 rounded-2xl bg-brand-navy text-white border border-brand-navy hover:bg-brand-navy-light shadow-sm hover:shadow-lg hover:shadow-brand-navy/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                        >
                            <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center mb-5">
                                <ShieldCheck size={28} className="text-brand-teal" />
                            </div>
                            <h2 className="font-display text-xl font-bold text-white mb-1.5">Admin console</h2>
                            <p className="text-sm text-brand-slate/75 leading-relaxed">Dashboard, staff, attendance with photo evidence, access logs and door control.</p>
                            <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-teal">
                                Sign in <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <div className="mt-3 text-[11px] font-semibold text-brand-slate/60">Administrators only</div>
                        </Motion.button>
                    </div>
                </div>
            </main>

            <footer className="px-6 py-5 text-center text-[11px] text-slate-400">
                © {YEAR} Englabs · Attendance Tracker
            </footer>
        </div>
    );
}
