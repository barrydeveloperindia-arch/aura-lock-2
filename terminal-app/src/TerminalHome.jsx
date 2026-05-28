import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Fingerprint, X, CheckCircle2, LogOut, AlertTriangle, Clock, ShieldAlert, Unlock, UserPlus, Bluetooth, BluetoothConnected, BluetoothOff, Cpu, RefreshCw, AlertCircle, Search, ChevronRight, Settings, Zap, Lock, History, Info, DoorOpen, ScanFace } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { BleClient } from '@capacitor-community/bluetooth-le';

// Production API Configuration
const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'https://auralock-backend-50851729985.asia-south1.run.app';
const RESET_DELAY = 5; // seconds

const BLE_MAC = '58:8C:81:CC:65:29';
const DOOR_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const DOOR_CHAR_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';

// ── Animated countdown ring ───────────────────────────────────────────────────
function CountdownRing({ seconds, total = RESET_DELAY, color = '#10b981' }) {
    const R = 22, C = 2 * Math.PI * R;
    const pct = seconds / total;
    return (
        <svg width={56} height={56} className="rotate-[-90deg]">
            <circle cx={28} cy={28} r={R} fill="none" stroke="rgba(15, 23, 42, 0.08)" strokeWidth={4} />
            <circle cx={28} cy={28} r={R} fill="none" stroke={color} strokeWidth={4}
                strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
                strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
        </svg>
    );
}

// ── Live clock ────────────────────────────────────────────────────────────────
function LiveClock() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const t = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="text-center mt-2 mb-4">
            <div className="text-5xl font-black tabular-nums tracking-tighter text-slate-900">
                {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
            <div className="text-slate-500 text-[9px] font-black mt-1 uppercase tracking-[0.2em]">
                {time.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
        </div>
    );
}

export default function TerminalHome() {
    // VERSION MARKER: 1546_FINAL
    useEffect(() => {
        console.log('🚀 [App] Version: 1546_FINAL');
    }, []);

    const navigate = useNavigate();
    useEffect(() => {
        console.log('🚀 [Init] App Mounted. Time:', new Date().toISOString(), 'API_BASE:', API_BASE);
    }, []);
    // view: 'home' | 'checkin' | 'checkout' | 'error' | 'admin_auth' | 'admin_select' | 'admin_scan'
    const [view, setView] = useState('home');
    const [verifyMethod, setVerifyMethod] = useState('face'); // 'face' | 'fingerprint'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [employees, setEmployees] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [result, setResult] = useState(null);
    const [countdown, setCountdown] = useState(RESET_DELAY);
    const [adminPin, setAdminPin] = useState('');
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [bleStatus, setBleStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'connected' | 'error'
    const [lastDoorUpdate, setLastDoorUpdate] = useState(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
    const [doorState, setDoorState] = useState('locked'); // 'locked' | 'unlocked'
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    // ── Local Door BLE Controller ─────────────────────────────────────────────
    const triggerDoorUnlock = async () => {
        try {
            setDoorState('unlocked');
            setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
            
            console.log('Initializing BleClient...');
            try { await BleClient.initialize(); } catch (e) {}

            console.log(`Connecting to lock: ${BLE_MAC}`);
            await BleClient.connect(BLE_MAC);

            const buffer = new ArrayBuffer(2);
            const viewData = new DataView(buffer);
            viewData.setUint8(0, 'O'.charCodeAt(0));
            viewData.setUint8(1, 'N'.charCodeAt(0));

            console.log('Sending direct ON GATT command to BLE door...');
            await BleClient.write(BLE_MAC, DOOR_SERVICE_UUID, DOOR_CHAR_UUID, viewData);

            // Hold open for 5.5 seconds then auto-relock
            setTimeout(async () => {
                try {
                    console.log('Sending OFF GATT command to auto-lock door...');
                    const offBuffer = new ArrayBuffer(3);
                    const offView = new DataView(offBuffer);
                    offView.setUint8(0, 'O'.charCodeAt(0));
                    offView.setUint8(1, 'F'.charCodeAt(0));
                    offView.setUint8(2, 'F'.charCodeAt(0));
                    await BleClient.write(BLE_MAC, DOOR_SERVICE_UUID, DOOR_CHAR_UUID, offView);

                    console.log('Relocked. Disconnecting BLE...');
                    await BleClient.disconnect(BLE_MAC);
                } catch (e) {
                    console.error('Auto-lock failed:', e);
                } finally {
                    setDoorState('locked');
                    setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
                }
            }, 5500);

        } catch (err) {
            console.error('BLE Door Error:', err);
            setTimeout(() => {
                setDoorState('locked');
                setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
            }, 5500);
        }
    };

    const [biometricStatus, setBiometricStatus] = useState('checking'); // 'online', 'offline', 'checking'

    useEffect(() => {
        let statusInterval;
        const checkBle = async () => {
            try {
                try { await BleClient.initialize(); } catch (ie) {}

                const result = await BleClient.isEnabled();
                if (!result) { setBleStatus('disabled'); return; }
                
                setBleStatus('searching');
                const devices = await BleClient.getConnectedDevices([DOOR_SERVICE_UUID]);
                const isConnected = devices.some(d => d.deviceId === BLE_MAC);
                
                if (isConnected) {
                    setBleStatus('connected');
                } else {
                    await BleClient.requestLEScan(
                        { services: [DOOR_SERVICE_UUID] },
                        (result) => {
                            if (result.device.deviceId === BLE_MAC || result.device.name?.includes('SmartDoor')) {
                                setBleStatus('ready');
                                BleClient.stopLEScan();
                            }
                        }
                    );
                    setTimeout(async () => {
                        await BleClient.stopLEScan();
                        setBleStatus(prev => prev === 'ready' || prev === 'connected' ? prev : 'offline');
                    }, 5000);
                }
            } catch (e) {
                setBleStatus('offline');
            }
        };

        const checkBiometricHealth = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/biometrics/health`, { timeout: 15000 });
                if (res.data.status === 'online' || res.data.status === 'connected' || res.data.status === 'ready') {
                    setBiometricStatus('online');
                } else {
                    setBiometricStatus('offline');
                }
            } catch (e) {
                setBiometricStatus('offline');
            }
        };

        const initSystem = async () => {
            await checkBle();
            await checkBiometricHealth();
        };

        initSystem();
        statusInterval = setInterval(() => { checkBiometricHealth(); }, 60000);
        
        return () => {
            clearInterval(statusInterval);
            BleClient.stopLEScan().catch(() => {});
        };
    }, []);

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/terminal/users`);
                setEmployees(res.data.filter(u => u.status !== 'Deleted'));
            } catch (err) {}
        };
        fetchEmployees();
    }, []);

    // ── Auto-reset countdown ──────────────────────────────────────────────────
    useEffect(() => {
        const resultViews = ['checkin', 'checkout', 'error'];
        if (!resultViews.includes(view)) return;

        setCountdown(RESET_DELAY);
        const tick = setInterval(() => setCountdown(c => c - 1), 1000);
        const done = setTimeout(reset, RESET_DELAY * 1000);
        return () => { clearInterval(tick); clearTimeout(done); };
    }, [view]);

    const reset = () => {
        setView('home');
        setVerifyMethod('face');
        setLoading(false);
        setMessage('');
        setResult(null);
        setSearchTerm('');
        setCountdown(RESET_DELAY);
        setIsScannerActive(false);
    };

    // ── Face Scan Live Feed ───────────────────────────────────────────────────
    const [isScannerActive, setIsScannerActive] = useState(false);

    // Auto-timeout scanner to idle state after 15 seconds to prevent battery drain
    useEffect(() => {
        if (isScannerActive && view === 'home' && verifyMethod === 'face') {
            const timeout = setTimeout(() => {
                setIsScannerActive(false);
                setMessage('Scanner idle (tap to wake)');
            }, 15000);
            return () => clearTimeout(timeout);
        }
    }, [isScannerActive, view, verifyMethod]);

    useEffect(() => {
        let interval;
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setMessage('Scanning...');

                if (view === 'home' && verifyMethod === 'face' && isScannerActive) {
                    interval = setInterval(captureAndVerify, 2000);
                } else if (view === 'admin_scan') {
                    // admin registration handles its own capture
                }
            } catch (err) {
                console.error(err);
                setMessage('Camera unavailable');
            }
        };

        if ((view === 'home' && verifyMethod === 'face' && isScannerActive) || view === 'admin_scan') {
            startCamera();
        } else {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
                streamRef.current = null;
            }
            if (interval) clearInterval(interval);
        }

        return () => {
            if (interval) clearInterval(interval);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [view, verifyMethod, isScannerActive]);

    const captureAndVerify = () => {
        if (!videoRef.current || view !== 'home' || verifyMethod !== 'face' || loading) return;

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        if (canvas.width === 0) return;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            try {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64data = reader.result;
                    try {
                        const res = await axios.post(`${API_BASE}/api/biometrics/face/verify`, {
                            image: base64data
                        }, {
                            headers: { 'Content-Type': 'application/json' },
                        });

                        if (res.data.success && view === 'home' && verifyMethod === 'face') {
                            const isCheckout = !!(res.data.check_out || res.data.checkout);
                            const now = new Date();
                            setResult({
                                name: res.data.user?.name || res.data.name || res.data.employee_name || 'Employee',
                                time: res.data.check_in
                                    ? new Date(res.data.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                                    : now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                                checkoutTime: res.data.check_out
                                    ? new Date(res.data.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                                    : now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                                workingHours: res.data.working_hours != null ? formatWorkHours(res.data.working_hours) : null,
                                isCheckout,
                            });
                            setView(isCheckout ? 'checkout' : 'checkin');
                            triggerDoorUnlock();
                        }
                    } catch (err) {
                        if (err.response?.status === 401 || err.response?.status === 403) {
                            setMessage(err.response.data.message || 'Face Not Identified');
                            setTimeout(() => { if (view === 'home' && verifyMethod === 'face') setMessage('Scanning...') }, 1500);
                        } else if (err.response?.status === 503) {
                            setMessage('Biometric Engine Offline');
                        } else if (!err.response) {
                            setMessage('Server Offline. Cannot connect to Backend.');
                        } else {
                            setMessage('Scanning...');
                        }
                    }
                };
            } catch (blobErr) {
                console.error("toBlob error:", blobErr);
            }
        }, 'image/jpeg', 0.8);
    };

    const captureAndRegister = () => {
        if (!videoRef.current || view !== 'admin_scan' || !selectedEmp) return;

        setLoading(true);
        setMessage('Capturing & Enrolling...');
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            if (!blob) { setLoading(false); return; }
            try {
                const form = new FormData();
                form.append('file', blob, 'register.jpg');
                form.append('employeeId', selectedEmp.employee_id || selectedEmp.id);
                form.append('email', selectedEmp.email);
                form.append('name', selectedEmp.name);
                form.append('re_enroll', 'true');

                const res = await axios.post(`${API_BASE}/api/biometrics/face/register`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                if (res.data.success) {
                    setMessage('Enrollment Successful!');
                    setTimeout(() => reset(), 2500);
                }
            } catch (err) {
                setMessage(err.response?.data?.message || 'Enrollment failed');
                setTimeout(() => setMessage('Tap Capture to try again'), 2000);
            } finally {
                setLoading(false);
            }
        }, 'image/jpeg', 0.9);
    };

    // ── Fingerprint Flow ─────────────────────────────────────────────────────
    const handleFingerprintScan = async () => {
        try {
            setVerifyMethod('fingerprint');
            
            // Explicitly stop all camera tracks before starting biometrics
            if (streamRef.current) {
                console.log('📷 [Biometric] Stopping camera tracks...');
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            // Wait 1s for hardware to settle completely
            await new Promise(r => setTimeout(r, 1000));

            console.log('🔍 [Biometric] Checking availability...');
            const avail = await NativeBiometric.isAvailable();
            if (!avail.isAvailable) {
                alert('Fingerprint sensor not detected.');
                setVerifyMethod('face');
                return;
            }

            console.log('👆 [Biometric] Starting authentication...');
            // Robust Biometric call with fallbacks for different plugin versions
            const authParams = {
                reason: 'Authenticate for door access',
                title: 'AuraLock Biometric V3 (RETRY)',
                subtitle: 'Scan your fingerprint',
                negativeButtonText: 'Cancel',
            };


            try {
                console.log('👆 [Biometric] Starting authentication with verifyIdentity...');
                // PRIMARY METHOD for @capgo/capacitor-native-biometric
                await NativeBiometric.verifyIdentity(authParams);
                console.log('✅ [Biometric] Verified successfully');
            } catch (authError) {
                console.error('❌ [Biometric] Auth error:', authError);
                alert('Fingerprint Error: ' + (authError.message || JSON.stringify(authError)));
                setVerifyMethod('face');
                return;
            }
            
            // If we reach here, verification was successful
            console.log('✅ [Biometric] Verified successfully');
            
            if (!employees || employees.length === 0) {
                alert('Verification Success, but no employee records found in app state. Please wait for sync.');
                setVerifyMethod('face');
                return;
            }

            try {
                setLoading(true);
                const emp = employees[0]; 
                console.log('👤 [Biometric] Marking attendance for:', emp.name);
                
                const res = await axios.post(`${API_BASE}/api/attendance/mark`, {
                    employee_id: emp.employee_id || emp.id,
                    method: 'fingerprint',
                    device_id: 'office_terminal',
                }, { timeout: 10000 });
                
                const data = res.data || {};
                console.log('📝 [Biometric] Backend response:', JSON.stringify(data));

                const isCheckout = !!(data.check_out);
                const now = new Date();
                
                // Safe date formatting helper
                const safeTime = (dateStr) => {
                    try {
                        if (!dateStr) return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    } catch (e) {
                        return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    }
                };

                setResult({
                    name: emp.name,
                    time: safeTime(data.check_in),
                    checkoutTime: safeTime(data.check_out),
                    workingHours: data.working_hours != null ? formatWorkHours(data.working_hours) : null,
                    isCheckout,
                });
                
                setView(isCheckout ? 'checkout' : 'checkin');
                triggerDoorUnlock();
            } catch (postErr) {
                console.error('❌ Attendance Mark Error:', postErr);
                alert('Server Error: ' + (postErr.message || 'Could not reach backend'));
                setVerifyMethod('face');
            }
        } catch (err) {
            console.error('❌ Fingerprint Error:', err);
            // Don't alert on user cancel
            const errMsg = err.message || JSON.stringify(err);
            if (errMsg && !errMsg.toLowerCase().includes('cancel')) {
                alert('Fingerprint Error: ' + errMsg);
            }
            setVerifyMethod('face'); 
        } finally {
            setLoading(false);
        }
    };

    // ── Helper ────────────────────────────────────────────────────────────────
    const formatWorkHours = (wh) => {
        const h = Math.floor(wh);
        const m = Math.round((wh - h) * 60);
        return `${h}h ${String(m).padStart(2, '0')}m`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="w-screen h-screen bg-[#f8fafc] flex flex-col p-5 text-slate-900 relative overflow-hidden font-sans">

            <AnimatePresence mode="wait">

                {/* ── HOME DASHBOARD ── */}
                {view === 'home' && (
                    <motion.div key="home"
                        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }}
                        className="flex flex-col w-full h-full">

                        {/* Top Bar */}
                        <div className="flex justify-between items-center w-full mb-3">
                            <div className="flex flex-col">
                                <span className="font-black text-xl tracking-tight text-slate-800">AURA<span className="text-emerald-500">LOCK</span></span>
                                <span className="text-[7px] text-slate-500 font-black uppercase tracking-widest">SMART BIOMETRIC TERMINAL</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50/50 rounded-full">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">
                                        {biometricStatus === 'online' ? 'SYSTEM ONLINE' : 'AI OFFLINE'}
                                    </span>
                                </div>
                                <div className="text-[11px] font-black text-slate-700 mt-1">TX-082</div>
                                <div className="text-[7px] text-slate-400 font-bold uppercase tracking-widest">Terminal ID</div>
                            </div>
                        </div>

                        {/* Sub Top Bar */}
                        <div className="flex justify-between items-center w-full mb-2 gap-2">
                            <button className="flex-1 flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-colors" onClick={() => navigate('/admin')}>
                                <ShieldAlert size={12} className="text-emerald-500" />
                                <span className="text-[10px] font-bold text-slate-700 whitespace-nowrap">Admin Panel</span>
                                <ChevronRight size={12} className="text-emerald-500" />
                            </button>

                            {/* BLE CONNECTION STATUS INDICATOR */}
                            <div className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-2xl border transition-all ${
                                bleStatus === 'ready' || bleStatus === 'connected' 
                                ? 'bg-emerald-50 border-emerald-200 shadow-sm' 
                                : bleStatus === 'searching' 
                                ? 'bg-blue-50 border-blue-200 shadow-sm'
                                : 'bg-slate-50 border-slate-200'
                            }`}>
                                {bleStatus === 'ready' || bleStatus === 'connected' ? (
                                    <><BluetoothConnected size={14} className="text-emerald-500 animate-pulse" /><span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Door Ready</span></>
                                ) : bleStatus === 'searching' ? (
                                    <><Search size={14} className="text-blue-500 animate-spin" /><span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Searching...</span></>
                                ) : (
                                    <><BluetoothOff size={14} className="text-slate-400" /><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Door Offline</span></>
                                )}
                            </div>

                            <button className="p-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-colors">
                                <Settings size={14} className="text-slate-400" />
                            </button>
                        </div>


                        <LiveClock />

                        {/* Main Camera Frame */}
                        <div className="relative w-full h-[42vh] bg-slate-900 rounded-[2rem] overflow-hidden mb-4 shadow-xl shrink-0">
                            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                                <div className={`w-1.5 h-1.5 rounded-full ${(isScannerActive || view === 'admin_scan') ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="text-[8px] font-black text-white uppercase tracking-widest">
                                    {(isScannerActive || view === 'admin_scan') ? 'CAMERA ACTIVE' : 'CAMERA STANDBY'}
                                </span>
                            </div>
                            <button className="absolute top-4 right-4 z-10 p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white/70">
                                <Zap size={14} />
                            </button>
                            
                            {verifyMethod === 'face' ? (
                                isScannerActive ? (
                                    <>
                                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                                        
                                        {/* Face Overlay Brackets */}
                                        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                            <div className="w-56 h-64 relative">
                                                {[['top-0 left-0', 'border-t-2 border-l-2 rounded-tl-2xl'], ['top-0 right-0', 'border-t-2 border-r-2 rounded-tr-2xl'], ['bottom-0 left-0', 'border-b-2 border-l-2 rounded-bl-2xl'], ['bottom-0 right-0', 'border-b-2 border-r-2 rounded-br-2xl']].map(([pos, br], i) => (
                                                    <div key={i} className={`absolute w-10 h-10 ${pos} ${br} border-emerald-400`} />
                                                ))}
                                            </div>
                                        </div>
                                        
                                        {/* Scanning line */}
                                        <motion.div
                                            animate={{ y: ['0%', '100%', '0%'] }}
                                            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                                            className="absolute left-0 right-0 h-[1px] bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] top-0 z-10"
                                            style={{ top: '10%', height: '80%' }}
                                        />
                                        
                                        {/* Bottom Text in Camera */}
                                        <div className="absolute bottom-5 left-0 right-0 text-center z-10 drop-shadow-md">
                                            <div className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-1">POSITION YOUR FACE IN THE FRAME</div>
                                            <div className="text-sm font-bold text-white">{message || 'Scanning...'}</div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-white p-6 cursor-pointer relative" onClick={() => setIsScannerActive(true)}>
                                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />
                                        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-4 animate-pulse">
                                            <ScanFace size={36} className="text-emerald-400" />
                                        </div>
                                        <div className="text-base font-extrabold tracking-tight text-white mb-1">Scanner Suspended</div>
                                        <p className="text-[9px] text-slate-400 uppercase tracking-widest text-center max-w-[200px] leading-relaxed">Tap to wake up camera and start recognition</p>
                                        <button className="mt-5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 rounded-xl font-black text-[9px] text-white uppercase tracking-widest transition-all shadow-md shadow-emerald-500/10">
                                            Wake Up Camera
                                        </button>
                                    </div>
                                )
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
                                    <ScanFace size={64} className="text-emerald-400 mb-4 animate-pulse" />
                                    <div className="text-lg font-bold">Awaiting Face Scan</div>
                                    <div className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest">Position yourself in front of the camera</div>
                                </div>
                            )}
                        </div>

                        {/* Verify Using Section */}
                        <div className="w-full mb-4">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-2">VERIFY USING</div>
                            <div className="grid grid-cols-2 gap-3">
                                <button className={`flex items-center gap-3 p-4 rounded-[1.25rem] border transition-all ${verifyMethod === 'face' ? 'bg-white border-emerald-400 shadow-lg shadow-emerald-500/10' : 'bg-white border-slate-200'}`} onClick={() => setVerifyMethod('face')}>
                                    <div className={`p-2.5 rounded-xl ${verifyMethod === 'face' ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                        <Camera size={20} className={verifyMethod === 'face' ? 'text-emerald-500' : 'text-slate-400'} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-[11px] font-black text-slate-900">Face Scan</div>
                                        <div className="text-[8px] text-slate-500 font-medium">Automated recognition</div>
                                    </div>
                                </button>
                                {/* Fingerprint button removed as per security requirements */}
                                <div className="flex items-center gap-3 p-4 rounded-[1.25rem] border bg-slate-50 border-slate-100 opacity-50 grayscale cursor-not-allowed">
                                    <div className="p-2.5 rounded-xl bg-slate-100">
                                        <Fingerprint size={20} className="text-slate-300" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-[11px] font-black text-slate-400">Fingerprint</div>
                                        <div className="text-[8px] text-slate-400 font-medium">Disabled</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Door Status */}
                        <div className="w-full bg-white border border-slate-200 rounded-[1.5rem] p-5 flex items-center justify-between mb-4 shadow-sm relative overflow-hidden">
                            <div className="flex items-center gap-4 relative z-10">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${doorState === 'unlocked' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                                    {doorState === 'unlocked' ? <Unlock size={22} /> : <Lock size={22} />}
                                </div>
                                <div>
                                    <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">DOOR STATUS</div>
                                    <div className={`text-lg font-black ${doorState === 'unlocked' ? 'text-emerald-500' : 'text-slate-900'}`}>{doorState === 'unlocked' ? 'UNLOCKED' : 'LOCKED'}</div>
                                    <div className="text-[8px] text-slate-400 font-medium mt-0.5">Last updated: {lastDoorUpdate}</div>
                                </div>
                            </div>
                            {/* Graphic on right */}
                            <div className="absolute right-[-10px] top-[-10px] bottom-[-10px] w-32 opacity-20 pointer-events-none flex items-center justify-end">
                                {doorState === 'unlocked' ? <DoorOpen size={100} className="text-emerald-500 drop-shadow-xl" /> : <Lock size={100} className="text-slate-400" />}
                            </div>
                        </div>

                        {/* Bottom Navigation Removed as requested */}
                    </motion.div>
                )}

                {/* ── ADMIN AUTH ── */}
                {view === 'admin_auth' && (
                    <motion.div key="admin_auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-[#f8fafc] flex items-center justify-center p-8">
                        <div className="bg-white border border-slate-200 shadow-xl p-8 rounded-3xl w-full max-w-md flex flex-col gap-6 items-center">
                            <div className="flex items-center justify-between w-full border-b border-slate-100 pb-4">
                                <h2 className="text-lg font-black flex items-center gap-2"><ShieldAlert size={20} className="text-emerald-500" /> Admin Access</h2>
                                <button onClick={reset} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} /></button>
                            </div>
                            <input type="password" placeholder="Enter Admin PIN" className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-2xl tracking-widest focus:outline-none focus:border-emerald-500/50" value={adminPin} onChange={e => setAdminPin(e.target.value)} autoFocus />
                            <button onClick={() => { if (adminPin === '1234') { setView('admin_select'); setAdminPin(''); } else { setMessage('Invalid PIN'); setTimeout(() => setMessage(''), 2000); } }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><Unlock size={18} /> Authenticate</button>
                            {message && <p className="text-red-500 text-sm font-bold">{message}</p>}
                        </div>
                    </motion.div>
                )}

                {/* ── ADMIN EMPLOYEE SELECT ── */}
                {view === 'admin_select' && (
                    <motion.div key="admin_select" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-[#f8fafc] flex items-center justify-center p-6">
                        <div className="bg-white border border-slate-200 shadow-xl p-6 rounded-3xl w-full h-[90vh] flex flex-col gap-5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
                                <h2 className="text-base font-black flex items-center gap-2"><UserPlus size={18} className="text-emerald-500" /> Select Employee</h2>
                                <button onClick={reset} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} /></button>
                            </div>
                            <input type="text" placeholder="Search by name…" className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-base focus:outline-none focus:border-emerald-500/50 placeholder:text-slate-400 transition-colors shrink-0" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} autoFocus />
                            <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                                {employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map(emp => (
                                    <button key={emp.id} onClick={() => { setSelectedEmp(emp); setView('admin_scan'); setMessage('Ready to capture'); }} className="flex w-full items-center gap-3 p-4 bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 rounded-2xl transition-all text-left">
                                        <div className="w-12 h-12 rounded-full bg-slate-100 overflow-hidden shrink-0"><img src={emp.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=f1f5f9&color=0f172a`} alt="" className="w-full h-full object-cover" /></div>
                                        <div><div className="font-bold text-sm text-slate-900 truncate">{emp.name}</div><div className="text-slate-500 font-medium text-[10px] uppercase">{emp.department || 'General'}</div></div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ── ADMIN CAPTURE SCAN ── */}
                {view === 'admin_scan' && (
                    <motion.div key="admin_scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-[#f8fafc] flex flex-col items-center justify-center gap-10 p-6">
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Register Face</h2>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{selectedEmp?.name}</p>
                        </div>
                        <div className="relative w-64 h-64 bg-slate-900 rounded-[2rem] overflow-hidden shadow-xl">
                            {[['top-0 left-0', 'border-t-2 border-l-2 rounded-tl-2xl'], ['top-0 right-0', 'border-t-2 border-r-2 rounded-tr-2xl'], ['bottom-0 left-0', 'border-b-2 border-l-2 rounded-bl-2xl'], ['bottom-0 right-0', 'border-b-2 border-r-2 rounded-br-2xl']].map(([pos, br], i) => (
                                <div key={i} className={`absolute z-10 w-8 h-8 ${pos} ${br} border-emerald-400 m-4`} />
                            ))}
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover relative z-0" style={{ transform: 'scaleX(-1)' }} />
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                                <div className="w-40 h-52 rounded-[100px] border-[3px] border-emerald-400/40 border-dashed" />
                            </div>
                        </div>
                        <div className="flex flex-col gap-4 text-center w-full max-w-sm">
                            <p className="text-lg font-bold text-emerald-600 min-h-[28px]">{message}</p>
                            <button onClick={captureAndRegister} disabled={loading} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-2xl font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                {loading ? 'Processing...' : 'Capture & Save'}
                            </button>
                            <button onClick={reset} disabled={loading} className="py-3 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-colors">Cancel</button>
                        </div>
                    </motion.div>
                )}

                {/* ── CHECK-IN SUCCESS (WELCOME) ── */}
                {view === 'checkin' && (
                    <motion.div key="checkin"
                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="absolute inset-0 z-50 bg-[#f8fafc] flex flex-col items-center justify-center gap-8 text-center p-6">

                        {/* Pulsing ring + icon */}
                        <div className="relative">
                            <motion.div
                                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="absolute inset-0 rounded-full bg-emerald-500/30"
                            />
                            <div className="w-40 h-40 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center relative shadow-xl shadow-emerald-500/20">
                                <CheckCircle2 size={80} className="text-emerald-500" />
                            </div>
                        </div>

                        <div>
                            <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-600 mb-3">
                                ✦ WELCOME ✦
                            </motion.p>
                            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {result?.name}
                            </motion.h2>
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                                className="text-emerald-500 font-black text-base uppercase tracking-widest mb-2">
                                Check In Successful
                            </motion.p>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-white border border-slate-200 rounded-full shadow-sm mt-2">
                                <Clock size={16} className="text-slate-400" />
                                <span className="text-slate-700 text-lg font-bold tabular-nums">{result?.time}</span>
                            </motion.div>
                        </div>

                        {/* Countdown */}
                        <div className="flex items-center gap-3 mt-8">
                            <CountdownRing seconds={countdown} color="#10b981" />
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Resetting in {countdown}s</span>
                        </div>
                    </motion.div>
                )}

                {/* ── CHECK-OUT SUCCESS (GOODBYE) ── */}
                {view === 'checkout' && (
                    <motion.div key="checkout"
                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="absolute inset-0 z-50 bg-[#f8fafc] flex flex-col items-center justify-center gap-8 text-center p-6">

                        <div className="relative">
                            <motion.div
                                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="absolute inset-0 rounded-full bg-indigo-500/30"
                            />
                            <div className="w-40 h-40 rounded-full bg-indigo-50 border-4 border-indigo-100 flex items-center justify-center relative shadow-xl shadow-indigo-500/20">
                                <LogOut size={72} className="text-indigo-500 ml-2" />
                            </div>
                        </div>

                        <div>
                            <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-600 mb-3">
                                ✦ GOODBYE ✦
                            </motion.p>
                            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                {result?.name}
                            </motion.h2>
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                                className="text-indigo-500 font-black text-base uppercase tracking-widest mb-2">
                                Check Out Successful
                            </motion.p>
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                                className="flex flex-col items-center gap-3 mt-4">
                                <div className="inline-flex items-center gap-2 px-5 py-2 bg-white border border-slate-200 rounded-full shadow-sm">
                                    <Clock size={16} className="text-slate-400" />
                                    <span className="text-slate-700 text-lg font-bold tabular-nums">{result?.checkoutTime}</span>
                                </div>
                                {result?.workingHours && (
                                    <div className="px-6 py-2 rounded-full bg-indigo-50 border border-indigo-100">
                                        <span className="text-indigo-600 font-black text-xs uppercase tracking-widest">
                                            {result.workingHours} WORKED TODAY
                                        </span>
                                    </div>
                                )}
                            </motion.div>
                        </div>

                        <div className="flex items-center gap-3 mt-8">
                            <CountdownRing seconds={countdown} color="#6366f1" />
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Resetting in {countdown}s</span>
                        </div>
                    </motion.div>
                )}

                {/* ── ERROR / NOT RECOGNIZED ── */}
                {view === 'error' && (
                    <motion.div key="error"
                        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                        className="absolute inset-0 z-50 bg-[#f8fafc] flex flex-col items-center justify-center gap-8 text-center p-6">

                        <div className="relative">
                            <motion.div
                                animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="absolute inset-0 rounded-full bg-rose-500/30"
                            />
                            <motion.div
                                animate={{ rotate: [-4, 4, -4, 4, 0] }}
                                transition={{ delay: 0.1, duration: 0.5 }}
                                className="w-40 h-40 rounded-full bg-rose-50 border-4 border-rose-100 flex items-center justify-center relative shadow-xl shadow-rose-500/20">
                                <AlertTriangle size={80} className="text-rose-500" />
                            </motion.div>
                        </div>

                        <div>
                            <motion.p initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                                className="text-[10px] font-black uppercase tracking-[0.4em] text-rose-500 mb-3">
                                ✦ ACCESS DENIED ✦
                            </motion.p>
                            <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                                className="text-4xl font-black text-slate-900 tracking-tight mb-2">
                                Face Not Recognized
                            </motion.h2>
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
                                className="text-rose-500 font-bold text-sm uppercase tracking-widest mb-1">
                                Please Try Again
                            </motion.p>
                            {message && message !== 'Face not recognized' && (
                                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
                                    className="text-slate-500 font-medium text-xs mt-2 px-6">{message}</motion.p>
                            )}
                        </div>

                        <motion.button
                            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                            onClick={reset}
                            className="mt-4 px-10 py-4 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 rounded-2xl font-black text-slate-700 text-xs uppercase tracking-widest transition-all">
                            Try Again
                        </motion.button>

                        <div className="flex items-center gap-3 mt-6">
                            <CountdownRing seconds={countdown} color="#f43f5e" />
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Auto-reset in {countdown}s</span>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
}
