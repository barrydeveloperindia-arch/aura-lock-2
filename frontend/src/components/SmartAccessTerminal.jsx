import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scan, Grid3x3, Lock, Shield, Cpu, Activity, UserCheck, UserX } from 'lucide-react';

export default function SmartAccessTerminal() {
    const [time, setTime] = useState(new Date());
    const [status, setStatus] = useState('idle'); // idle, scanning, success, denied

    // Clock Update
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Automatic Face Recognition Flow
    useEffect(() => {
        let timeout;

        const runAutoScan = () => {
            // 1. Start in Idle (Waiting)
            setStatus('idle');

            // 2. Transition to Scanning after a brief "detection" delay
            timeout = setTimeout(() => {
                setStatus('scanning');

                // 3. Process Result
                setTimeout(() => {
                    const success = Math.random() > 0.3; // 70% success rate for demo
                    setStatus(success ? 'success' : 'denied');

                    // 4. Reset after delay
                    setTimeout(() => {
                        runAutoScan();
                    }, 4000);
                }, 2500); // Scanning duration
            }, 1500); // Idle duration before "detecting" a face
        };

        runAutoScan();

        return () => clearTimeout(timeout);
    }, []);

    // Format Time
    const formatTime = (date) => {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    };
    const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    };

    return (
        <div className="h-screen w-screen bg-slate-950 overflow-hidden relative flex items-center justify-center font-sans tracking-wide">
            {/* Background Ambience */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 z-0"></div>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full mix-blend-screen animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-cyan-600/10 blur-[150px] rounded-full mix-blend-screen"></div>

            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 z-0 opacity-20 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>

            {/* Main Container */}
            <div className="relative z-10 w-full max-w-lg h-[90vh] bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-[3rem] shadow-[0_0_80px_rgba(0,0,0,0.6)] flex flex-col p-10 overflow-hidden">

                {/* Top Glow */}
                <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[3px] shadow-[0_0_30px_rgba(59,130,246,1)] transition-colors duration-500 ${status === 'success' ? 'bg-emerald-500 shadow-emerald-500' : status === 'denied' ? 'bg-red-500 shadow-red-500' : 'bg-blue-500'}`}></div>

                {/* --- TOP SECTION --- */}
                <header className="flex justify-between items-start mb-10">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
                            <Shield className="w-8 h-8 text-blue-400 drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]" />
                            <span className="text-xs font-bold tracking-[0.3em] text-blue-300/60 uppercase">SecureCorp</span>
                        </div>
                        <h1 className="text-xl font-medium text-white tracking-widest text-shadow-glow">SMART TERMINAL</h1>
                    </div>
                    <div className="text-right">
                        <div className="text-3xl font-light text-white tracking-tighter">{formatTime(time)}</div>
                    </div>
                </header>

                {/* --- CENTER SECTION (Auto Scan) --- */}
                <main className="flex-1 flex flex-col items-center justify-center relative mb-10">

                    {/* Camera Frame */}
                    <div className={`relative w-full aspect-[4/4] rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-700 border-2 ${status === 'success' ? 'border-emerald-500/50 shadow-emerald-500/20' : status === 'denied' ? 'border-red-500/50 shadow-red-500/20' : 'border-blue-500/30 shadow-blue-500/10'}`}>

                        {/* Camera Feed Simulation */}
                        <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                            {/* Placeholder Silhouette */}
                            <motion.div
                                className="w-48 h-64 bg-slate-700/50 rounded-[50%] blur-2xl"
                                animate={{ opacity: [0.4, 0.6, 0.4] }}
                                transition={{ duration: 3, repeat: Infinity }}
                            />
                        </div>

                        {/* Overlays based on Status */}
                        <div className="absolute inset-0 flex items-center justify-center">

                            {/* IDLE / SCANNING RINGS */}
                            {(status === 'idle' || status === 'scanning') && (
                                <>
                                    <div className={`w-[85%] h-[85%] border border-blue-400/30 rounded-full absolute ${status === 'scanning' ? 'animate-scan-spin border-t-blue-400 border-b-blue-400' : 'opacity-60'}`}></div>
                                    <div className={`w-[70%] h-[70%] border border-cyan-400/20 rounded-full absolute ${status === 'scanning' ? 'animate-reverse-spin border-dashed' : 'opacity-40'}`}></div>

                                    {/* Scanning Line */}
                                    {status === 'scanning' && (
                                        <motion.div
                                            className="absolute w-full h-[2px] bg-blue-400/80 shadow-[0_0_20px_rgba(59,130,246,1)]"
                                            animate={{ top: ['10%', '90%', '10%'] }}
                                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                        />
                                    )}
                                </>
                            )}

                            {/* SUCCESS STATE */}
                            {status === 'success' && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center justify-center"
                                >
                                    <div className="w-32 h-32 rounded-full border-4 border-emerald-500/50 flex items-center justify-center bg-emerald-500/10 mb-4 shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                                        <UserCheck className="w-16 h-16 text-emerald-400" />
                                    </div>
                                    <motion.h2
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        className="text-2xl font-bold text-white tracking-widest"
                                    >
                                        ACCESS GRANTED
                                    </motion.h2>
                                </motion.div>
                            )}

                            {/* ERROR STATE */}
                            {status === 'denied' && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center justify-center"
                                >
                                    <div className="w-32 h-32 rounded-full border-4 border-red-500/50 flex items-center justify-center bg-red-500/10 mb-4 shadow-[0_0_50px_rgba(239,68,68,0.3)]">
                                        <UserX className="w-16 h-16 text-red-400" />
                                    </div>
                                    <motion.h2
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        className="text-xl font-bold text-white tracking-widest"
                                    >
                                        NOT RECOGNIZED
                                    </motion.h2>
                                </motion.div>
                            )}
                        </div>

                        {/* Status Pill */}
                        <div className="absolute bottom-6 left-0 w-full flex justify-center">
                            <div className={`px-6 py-2 rounded-full backdrop-blur-md border flex items-center gap-2 ${status === 'success' ? 'bg-emerald-500/20 border-emerald-500/30' : status === 'denied' ? 'bg-red-500/20 border-red-500/30' : 'bg-slate-900/60 border-white/10'}`}>
                                <div className={`w-2 h-2 rounded-full ${status === 'scanning' ? 'bg-yellow-400 animate-pulse' : status === 'success' ? 'bg-emerald-400' : status === 'denied' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'}`}></div>
                                <span className="text-xs font-bold tracking-widest text-white uppercase">
                                    {status === 'idle' ? 'Waiting for face...' : status === 'scanning' ? 'Scanning...' : status === 'success' ? 'Face Verified' : 'Face Not Recognized'}
                                </span>
                            </div>
                        </div>

                    </div>

                    {/* Instruction Text */}
                    <div className="mt-8 text-center h-8">
                        <p className="text-blue-200/60 text-sm tracking-[0.2em] uppercase animate-pulse">
                            {status === 'idle' ? 'Please look at the camera' : status === 'scanning' ? 'Align face inside the circle' : status === 'success' ? 'Unlocking Door...' : 'Please try again'}
                        </p>
                    </div>

                </main>

                {/* --- BOTTOM SECTION (Fallback) --- */}
                <footer className="grid grid-cols-2 gap-4">
                    <button className="h-16 bg-slate-800/40 hover:bg-slate-700/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group">
                        <Scan className="w-5 h-5 text-blue-400/70 group-hover:text-blue-300" />
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-200 tracking-wider uppercase">Scan ID</span>
                    </button>
                    <button className="h-16 bg-slate-800/40 hover:bg-slate-700/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group">
                        <Grid3x3 className="w-5 h-5 text-blue-400/70 group-hover:text-blue-300" />
                        <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-200 tracking-wider uppercase">Passcode</span>
                    </button>
                </footer>

            </div>
        </div>
    );
}
