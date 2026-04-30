import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scan, Fingerprint, Lock, Shield, ScanFace, UserCheck, UserX, Loader2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api.service';

export default function Terminal() {
    const [time, setTime] = useState(new Date());
    const [status, setStatus] = useState('idle'); // idle, scanning, success, denied
    const [user, setUser] = useState(null);
    const [activeMethod, setActiveMethod] = useState(null);
    const [camEnabled, setCamEnabled] = useState(false);
    const [camError, setCamError] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);

    const isSecure = window.isSecureContext;

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (isSecure) {
            startCamera();
        } else {
            setCamError("Site not in Secure Context. Camera blocked by browser.");
        }
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        setCamError(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 }
            });

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                setCamEnabled(true);
            } else {
                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = mediaStream;
                        setCamEnabled(true);
                    }
                }, 500);
            }
        } catch (err) {
            setCamEnabled(false);
            setCamError(err.name === 'NotAllowedError' ? "Camera permission denied" : "Hardware error");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    useEffect(() => {
        let interval;
        if (status === 'idle' && camEnabled) {
            interval = setInterval(() => {
                captureAndVerify();
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [status, camEnabled]);

    const captureAndVerify = async () => {
        if (status !== 'idle' || !videoRef.current || !canvasRef.current) return;

        const context = canvasRef.current.getContext('2d');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);

        canvasRef.current.toBlob(async (blob) => {
            if (!blob) return;

            setStatus('scanning');
            setActiveMethod('Face');

            try {
                const response = await apiService.verifyFace(blob);
                if (response.success) {
                    setUser(response.user);
                    setStatus('success');
                    setTimeout(() => reset(), 3000);
                } else {
                    setErrorMsg(response.message || 'Face not recognized');
                    setStatus('denied');
                    setTimeout(() => reset(), 2500);
                }
            } catch (error) {
                setErrorMsg(error.message || 'Verification error');
                setStatus('denied');
                setTimeout(() => reset(), 3000);
            }
        }, 'image/jpeg', 0.8);
    };

    const handleVerifySync = async (method) => {
        setStatus('scanning');
        setActiveMethod(method);
        setTimeout(() => setStatus('denied'), 2000);
        setTimeout(() => reset(), 4000);
    };

    const reset = () => {
        setStatus('idle');
        setUser(null);
        setActiveMethod(null);
        setErrorMsg('');
    };

    const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    return (
        <div className="h-screen w-screen bg-[#f8fafc] overflow-hidden relative flex items-center justify-center font-sans">
            {/* Background Animations */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-400/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-teal-400/10 blur-[100px] rounded-full animate-pulse-slow" />
            </div>

            {/* Terminal Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-full max-w-lg h-[85vh] bg-white/80 backdrop-blur-2xl border border-slate-200 rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] flex flex-col p-8 md:p-12"
            >
                {/* Header */}
                <header className="flex justify-between items-center mb-12">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-slate-900 font-bold tracking-tight">SECURE ACCESS</h1>
                            <p className="text-emerald-600 text-[10px] uppercase font-bold tracking-widest">Version 2.4.0</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <div className="text-2xl font-light text-slate-800 tracking-tight">{formatTime(time)}</div>
                            <p className="text-slate-400 text-[10px] uppercase font-bold">{format(time, 'EEEE, MMM dd')}</p>
                        </div>
                        <Link
                            to="/admin"
                            className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all active:scale-90"
                            title="Admin Panel"
                        >
                            <Settings className="w-5 h-5" />
                        </Link>
                    </div>
                </header>

                {/* Scan Area */}
                <div className="flex-1 flex flex-col items-center justify-center relative">
                    <AnimatePresence mode="wait">
                        {status === 'idle' || status === 'scanning' ? (
                            <motion.div
                                key="scan"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.1 }}
                                className="relative w-full aspect-square max-w-[320px]"
                            >
                                {/* Scan Ring Outer */}
                                <div className={`absolute inset-0 rounded-full border border-slate-200 flex items-center justify-center shadow-inner bg-slate-50/50 ${status === 'scanning' ? 'animate-pulse' : ''}`}>
                                    <div className={`w-[90%] h-[90%] rounded-full border border-emerald-500/20 border-dashed ${status === 'scanning' ? 'animate-spin-slow' : ''}`} />
                                </div>

                                {/* Scanner Visual */}
                                <div className="absolute inset-4 rounded-full bg-white overflow-hidden flex items-center justify-center border border-slate-100 shadow-sm">
                                    {status === 'scanning' && (
                                        <motion.div
                                            initial={{ top: '0%' }}
                                            animate={{ top: '100%' }}
                                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                            className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent z-20 shadow-[0_0_20px_rgba(52,211,153,0.8)]"
                                        />
                                    )}

                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        className={`w-full h-full object-cover transition-opacity duration-700 ${camEnabled ? 'opacity-100' : 'opacity-0 hidden'}`}
                                        style={{ transform: 'scaleX(-1)' }} // Mirror
                                    />

                                    {!camEnabled && (
                                        <div className="flex flex-col items-center gap-4 z-10">
                                            <ScanFace className={`w-32 h-32 transition-colors duration-500 ${status === 'scanning' ? 'text-emerald-500' : 'text-slate-300'}`} />
                                            {camError && <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{camError}</p>}
                                            <button
                                                onClick={startCamera}
                                                className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all active:scale-95"
                                            >
                                                {camError ? 'Retry Camera' : 'Start Camera'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Overlay Gradient for depth */}
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/20 pointer-events-none" />
                                </div>
                                <canvas ref={canvasRef} className="hidden" />

                                {/* Status Label */}
                                <div className="absolute -bottom-12 left-0 right-0 text-center">
                                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border transition-colors duration-500 ${status === 'scanning' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                        {status === 'scanning' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                        <p className="text-[10px] font-bold tracking-widest uppercase">
                                            {status === 'scanning' ? `Verifying...` : 'Ready for verification'}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ) : status === 'success' ? (
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center text-center w-full"
                            >
                                <div className="w-48 h-48 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-8 relative shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1.5, opacity: 0 }}
                                        transition={{ duration: 1, repeat: Infinity }}
                                        className="absolute inset-0 rounded-full bg-emerald-400/20"
                                    />
                                    <UserCheck className="w-24 h-24 text-emerald-500" />
                                </div>
                                <h2 className="text-3xl font-black text-emerald-600 tracking-tight mb-2">ACCESS GRANTED</h2>
                                <p className="text-slate-500 text-xs mt-4 tracking-[0.2em] uppercase font-bold">Welcome Back,</p>
                                <p className="text-slate-800 text-xl font-black mt-1">{user?.name || 'Authorized User'}</p>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="denied"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="flex flex-col items-center text-center w-full"
                            >
                                <div className="w-40 h-40 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
                                    <UserX className="w-20 h-20 text-red-500" />
                                </div>
                                <h2 className="text-3xl font-black text-red-500 tracking-tight mb-2">ACCESS DENIED</h2>
                                <p className="text-red-600 font-bold uppercase tracking-[0.1em] text-sm mt-2">{errorMsg}</p>
                                <p className="text-slate-400 font-medium uppercase tracking-widest text-[10px] mt-2">Please try again</p>
                                <button
                                    onClick={reset}
                                    className="mt-8 px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all active:scale-95"
                                >
                                    Retry
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Footer Controls */}
                <footer className="mt-12">
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={() => handleVerifySync('Fingerprint')}
                            disabled={status !== 'idle'}
                            className="flex-1 max-w-[140px] h-20 rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-emerald-300 hover:bg-emerald-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                        >
                            <Fingerprint className="w-6 h-6 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                            <span className="text-[10px] font-bold tracking-widest text-slate-500 group-hover:text-emerald-600 uppercase">Biometric</span>
                        </button>
                        <button
                            onClick={() => handleVerifySync('RFID')}
                            disabled={status !== 'idle'}
                            className="flex-1 max-w-[140px] h-20 rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-emerald-300 hover:bg-emerald-50 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group shadow-sm"
                        >
                            <Scan className="w-6 h-6 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                            <span className="text-[10px] font-bold tracking-widest text-slate-500 group-hover:text-emerald-600 uppercase">ID Card</span>
                        </button>
                    </div>
                </footer>
            </motion.div>
        </div>
    );
}
