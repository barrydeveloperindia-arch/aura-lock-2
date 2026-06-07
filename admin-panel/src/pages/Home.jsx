import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanFace, ShieldEllipsis, ShieldCheck, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
    const navigate = useNavigate();

    return (
        <div className="w-screen h-screen flex flex-col items-center justify-center p-8 bg-[#0f172a] text-white relative overflow-hidden">
            {/* Background Orbs */}
            <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />

            {/* Header */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10 md:mb-16"
            >
                <div className="flex items-center justify-center gap-2 mb-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#52b39a] to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/30">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M 11.9 57.65 C 11.78 58.05, 11.84 58.79, 11.90 59.15 C 11.96 59.51, 11.81 59.26, 12.25 59.80 C 12.69 60.34, 13.50 61.34, 14.52 62.38 C 15.54 63.42, 16.82 64.83, 18.36 66.05 C 19.90 67.27, 22.05 68.74, 23.76 69.71 C 25.47 70.68, 27.07 71.29, 28.64 71.86 C 30.21 72.43, 31.93 72.86, 33.18 73.15 C 34.43 73.44, 34.77 73.51, 36.14 73.58 C 37.51 73.65, 40.24 73.22, 41.37 73.58 C 42.50 73.94, 42.18 74.88, 42.94 75.74 C 43.70 76.60, 44.68 77.67, 45.90 78.75 C 47.12 79.83, 48.63 81.12, 50.26 82.20 C 51.89 83.28, 53.81 84.38, 55.67 85.21 C 57.53 86.03, 59.59 86.72, 61.42 87.15 C 63.25 87.58, 64.70 87.76, 66.65 87.80 C 68.60 87.84, 71.44 87.59, 73.10 87.37 C 74.76 87.16, 75.17 86.98, 76.59 86.51 C 78.01 86.04, 80.04 85.36, 81.64 84.57 C 83.24 83.78, 85.37 82.31, 86.18 81.77 C 87.00 81.23, 86.42 81.41, 86.53 81.34 C 86.64 81.27, 86.61 81.56, 86.87 81.34 C 87.13 81.12, 87.92 80.58, 88.10 80.04 C 88.27 79.50, 88.04 78.50, 87.92 78.11 C 87.80 77.72, 87.63 77.79, 87.40 77.68 C 87.17 77.57, 87.34 77.03, 86.53 77.46 C 85.72 77.89, 83.94 79.44, 82.52 80.26 C 81.09 81.09, 79.14 81.91, 77.98 82.41 C 76.82 82.91, 76.70 82.98, 75.54 83.27 C 74.38 83.56, 72.20 83.96, 71.01 84.14 C 69.82 84.32, 69.47 84.35, 68.39 84.35 C 67.31 84.35, 66.25 84.43, 64.56 84.14 C 62.88 83.85, 59.65 83.06, 58.28 82.63 C 56.91 82.20, 57.00 81.84, 56.36 81.55 C 55.72 81.26, 55.29 81.34, 54.45 80.91 C 53.61 80.48, 52.07 79.51, 51.31 78.97 C 50.55 78.43, 50.38 78.04, 49.91 77.68 C 49.44 77.32, 49.13 77.31, 48.52 76.81 C 47.91 76.31, 46.77 75.30, 46.25 74.66 C 45.73 74.02, 44.94 73.37, 45.38 72.94 C 45.82 72.51, 48.14 72.05, 48.87 72.08 C 49.60 72.11, 49.42 72.86, 49.74 73.15 C 50.06 73.44, 50.43 73.51, 50.78 73.80 C 51.13 74.09, 50.96 74.27, 51.83 74.88 C 52.70 75.49, 55.22 77.03, 56.01 77.46 C 56.80 77.89, 56.05 77.24, 56.54 77.46 C 57.03 77.67, 57.99 78.36, 58.98 78.75 C 59.97 79.14, 61.22 79.54, 62.47 79.83 C 63.72 80.12, 65.12 80.37, 66.48 80.48 C 67.84 80.59, 69.03 80.66, 70.66 80.48 C 72.29 80.30, 75.02 79.69, 76.24 79.40 C 77.46 79.11, 77.49 79.00, 77.98 78.75 C 78.47 78.50, 78.47 78.28, 79.20 77.89 C 79.93 77.50, 81.47 76.88, 82.34 76.38 C 83.21 75.88, 84.02 75.24, 84.43 74.88 C 84.84 74.52, 84.75 74.63, 84.78 74.23 C 84.81 73.84, 84.72 72.91, 84.61 72.51 C 84.50 72.12, 84.38 71.97, 84.09 71.86 C 83.80 71.75, 83.70 71.43, 82.86 71.86 C 82.02 72.29, 80.37 73.72, 79.03 74.44 C 77.69 75.16, 76.32 75.74, 74.84 76.17 C 73.36 76.60, 71.48 76.89, 70.14 77.03 C 68.80 77.17, 68.04 77.14, 66.82 77.03 C 65.60 76.92, 63.94 76.63, 62.81 76.38 C 61.68 76.13, 60.99 75.88, 60.03 75.52 C 59.07 75.16, 58.28 74.91, 57.06 74.23 C 55.84 73.55, 53.48 72.08, 52.70 71.43 C 51.92 70.78, 52.29 70.56, 52.35 70.35 C 52.41 70.13, 52.27 70.61, 53.05 70.14 C 53.83 69.67, 55.78 68.55, 57.06 67.55 C 58.34 66.55, 59.59 65.33, 60.72 64.11 C 61.85 62.89, 62.87 61.67, 63.86 60.23 C 64.85 58.79, 65.95 56.85, 66.65 55.49 C 67.35 54.13, 67.55 53.56, 68.04 52.05 C 68.53 50.54, 69.26 47.89, 69.61 46.45 C 69.96 45.01, 69.99 44.65, 70.14 43.43 C 70.29 42.21, 70.43 40.59, 70.49 39.12 C 70.55 37.65, 70.61 36.29, 70.49 34.60 C 70.37 32.91, 70.05 30.47, 69.79 29.00 C 69.53 27.53, 69.30 26.92, 68.92 25.77 C 68.54 24.62, 68.07 23.22, 67.52 22.11 C 66.97 21.00, 66.18 19.91, 65.60 19.09 C 65.02 18.27, 64.62 17.77, 64.04 17.16 C 63.46 16.55, 62.12 15.43, 59.50 13.71, 56.54 12.63, 54.79 12.20, 51.13 12.20, 48.00 12.85, 45.21 13.93, 42.07 16.08, 40.15 17.80, 37.53 21.03, 35.09 25.34, 33.87 28.36, 33.00 31.15, 33.00 31.80, 32.65 32.45, 31.96 36.32, 31.61 39.99, 31.61 46.66, 31.96 50.54, 33.70 58.94, 34.92 62.17, 34.74 62.81, 32.48 61.95, 30.39 61.52, 26.55 59.58, 22.02 56.14, 20.27 54.42, 19.23 52.91, 18.01 51.83, 16.79 51.83, 16.09 52.91, 16.26 54.42, 17.83 56.35, 20.62 59.15, 22.89 61.09, 23.93 61.52, 26.03 63.03, 30.39 65.18, 34.57 66.26, 37.53 66.69, 42.76 66.48, 46.08 65.83, 48.34 64.97, 51.31 63.25, 52.18 63.03, 56.36 59.37, 59.33 55.92, 62.12 50.75, 63.34 47.31, 64.04 44.08, 64.56 40.20, 64.56 35.03, 64.04 31.59, 63.16 28.14, 62.64 26.85, 61.07 24.26, 58.98 21.89, 57.41 20.82, 55.14 19.96, 50.96 19.74, 48.34 20.60, 46.43 21.68, 44.33 23.40, 42.24 25.77, 40.50 29.00, 39.10 32.23, 38.58 33.95, 37.71 38.91, 37.36 43.43, 37.53 47.31, 38.58 54.42, 39.97 58.94, 41.20 61.74, 41.20 62.17, 41.54 62.60, 41.20 63.03, 38.41 63.03, 38.06 62.60, 36.66 58.72, 35.27 53.55, 34.57 49.03, 34.40 46.45, 34.40 39.99, 35.27 33.74, 36.66 29.22, 37.71 26.63, 38.93 24.48, 42.24 20.17, 44.51 18.23, 46.25 17.16, 50.78 15.65, 54.62 15.65, 57.41 16.51, 59.85 18.02, 60.20 18.02, 61.94 19.52, 64.04 22.11, 65.95 25.99, 66.82 28.57, 67.70 34.39, 67.70 39.99, 67.00 45.15, 66.13 48.82, 63.16 55.71, 61.25 58.51, 58.28 62.17, 56.36 63.89, 52.00 66.91, 49.39 68.20, 48.00 68.41, 46.95 69.06, 41.89 70.14, 34.74 69.92, 29.51 68.63, 28.64 67.98, 28.12 67.98, 24.81 66.48, 22.02 64.75, 19.40 62.38, 17.83 61.31, 13.82 56.78, 13.13 56.57, 12.60 56.78 Z M 56.19 24.05, 57.58 24.91, 59.50 27.28, 61.25 31.80, 61.77 35.03, 61.77 39.99, 61.42 43.00, 60.72 45.80, 60.03 47.52, 59.89 47.99, 59.85 48.60, 58.63 51.18, 57.58 52.91, 54.10 57.22, 51.83 59.15, 48.34 61.31, 46.25 62.17, 44.86 62.38, 42.94 58.72, 42.94 58.29, 42.24 56.78, 41.37 53.77, 40.50 49.03, 40.32 40.63, 41.02 36.32, 41.89 33.09, 42.94 30.51, 42.94 30.51, 44.16 28.57, 46.60 25.56, 48.00 24.48, 51.13 23.19, 52.88 23.40, 53.57 23.19 Z" />
                        </svg>
                    </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2">Eng<span className="text-[#52b39a] font-normal">labs</span> <span className="text-slate-400 font-bold">Attendance</span></h1>
                <p className="text-slate-500 text-[10px] md:text-sm font-medium uppercase tracking-[0.2em]">Smart Tracking Terminal</p>
            </motion.div>

            {/* Main Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl relative z-10">
                {/* Start Scanner */}
                <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/scanner')}
                    className="group p-6 md:p-8 rounded-[2rem] bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-blue-500/30 transition-all flex flex-col items-center gap-4 md:gap-6 text-center"
                >
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <ScanFace size={32} className="text-blue-400 md:hidden" />
                        <ScanFace size={40} className="text-blue-400 hidden md:block" />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-white mb-2">Start Scanner</h2>
                        <p className="text-slate-500 text-xs md:text-sm font-medium">Open biometric terminal for face & fingerprint recognition</p>
                    </div>
                    <div className="mt-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-blue-400">
                        No Login Required
                    </div>
                </motion.button>

                {/* Admin Panel */}
                <motion.button
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/admin')}
                    className="group p-6 md:p-8 rounded-[2rem] bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all flex flex-col items-center gap-4 md:gap-6 text-center"
                >
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                        <ShieldEllipsis size={32} className="text-emerald-400 md:hidden" />
                        <ShieldEllipsis size={40} className="text-emerald-400 hidden md:block" />
                    </div>
                    <div>
                        <h2 className="text-xl md:text-2xl font-black text-white mb-2">Admin Panel</h2>
                        <p className="text-slate-500 text-xs md:text-sm font-medium">Access dashboard, logs, and employee management</p>
                    </div>
                    <div className="mt-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        Admin Login Required
                    </div>
                </motion.button>
            </div>

            {/* System Status Footer */}
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute bottom-10 flex items-center gap-5 text-slate-600"
            >
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Biometric API: Online</span>
                </div>
                <div className="w-px h-3 bg-white/10" />
                <div className="flex items-center gap-2">
                    <Activity size={12} />
                    <span className="text-[10px] font-black uppercase tracking-widest">v2.8 Stable</span>
                </div>
            </motion.div>
        </div>
    );
}
