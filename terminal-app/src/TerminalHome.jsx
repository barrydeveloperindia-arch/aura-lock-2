import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Fingerprint, X, CheckCircle2, LogOut, AlertTriangle, Clock, ShieldAlert, Unlock, UserPlus, Bluetooth, BluetoothConnected, BluetoothOff, Cpu, RefreshCw, AlertCircle, Search, ChevronRight, Settings, Zap, Lock, History, Info, DoorOpen, ScanFace, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { BleClient } from '@capacitor-community/bluetooth-le';
import { Geolocation } from '@capacitor/geolocation';
import { localFaceService } from './LocalFaceService';
import pkg from '../package.json';

// Production API Configuration
const API_BASE = import.meta.env?.VITE_API_BASE_URL || 'https://auralock-backend-50851729985.asia-south1.run.app';
const RESET_DELAY = 5; // seconds
const ADMIN_DOOR_PIN = '2026';
const MAX_PIN_ATTEMPTS = 3;
const PIN_COOLDOWN_SECONDS = 30;
const CAPTURE_INTERVAL_MS = 800;

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
    // VERSION MARKER: 2100_PIN_LOCALFACE

    const navigate = useNavigate();
    // view: 'home' | 'checkin' | 'checkout' | 'error' | 'admin_auth' | 'admin_select' | 'admin_scan' | 'admin_door_pin'
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
    const [bleStatus, setBleStatus] = useState('disconnected');
    const [lastDoorUpdate, setLastDoorUpdate] = useState(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
    const [doorState, setDoorState] = useState('locked');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [isScanning, setIsScanning] = useState(false);
    const verifyInFlightRef = useRef(false);

    // ── Terminal geo-stamp ────────────────────────────────────────────────
    // The tablet's own GPS fix, refreshed every 60 s, sent with every scan so the
    // backend can stamp WHERE the check-in happened. Failure is silent: a scan
    // never waits for GPS.
    const lastFixRef = useRef(null);
    useEffect(() => {
        let stopped = false;
        const refresh = async () => {
            try {
                const perm = await Geolocation.checkPermissions();
                if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    if (req.location !== 'granted' && req.coarseLocation !== 'granted') return;
                }
                const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
                if (!stopped && pos?.coords) {
                    lastFixRef.current = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy: Math.round(pos.coords.accuracy || 0),
                        fix_time: new Date(pos.timestamp || Date.now()).toISOString(),
                    };
                }
            } catch (_e) { /* no GPS, keep last fix */ }
        };
        refresh();
        const t = setInterval(refresh, 60000);
        return () => { stopped = true; clearInterval(t); };
    }, []);
    const appendLocation = (formData) => {
        const fix = lastFixRef.current;
        if (!fix) return;
        formData.append('lat', String(fix.lat));
        formData.append('lng', String(fix.lng));
        formData.append('accuracy', String(fix.accuracy));
        formData.append('fix_time', fix.fix_time);
    };

    // PIN Protection State
    const [doorPinInput, setDoorPinInput] = useState('');
    const [doorPinAttempts, setDoorPinAttempts] = useState(0);
    const [doorPinCooldown, setDoorPinCooldown] = useState(0);
    const [doorPinError, setDoorPinError] = useState('');

    // ── Local Door BLE Controller ─────────────────────────────────────────────
    const triggerDoorUnlock = async () => {
        let shouldDisconnect = true;
        try {
            setDoorState('unlocked');
            setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
            
            try { await BleClient.initialize(); } catch (_e) {}

            await BleClient.connect(BLE_MAC);

            const buffer = new ArrayBuffer(2);
            const viewData = new DataView(buffer);
            viewData.setUint8(0, 'O'.charCodeAt(0));
            viewData.setUint8(1, 'N'.charCodeAt(0));

            await BleClient.write(BLE_MAC, DOOR_SERVICE_UUID, DOOR_CHAR_UUID, viewData);

            // Successfully wrote ON command, delegate disconnection to the timeout
            shouldDisconnect = false;

            // Hold open for 5.5 seconds then auto-relock
            setTimeout(async () => {
                try {
                    const offBuffer = new ArrayBuffer(3);
                    const offView = new DataView(offBuffer);
                    offView.setUint8(0, 'O'.charCodeAt(0));
                    offView.setUint8(1, 'F'.charCodeAt(0));
                    offView.setUint8(2, 'F'.charCodeAt(0));
                    await BleClient.write(BLE_MAC, DOOR_SERVICE_UUID, DOOR_CHAR_UUID, offView);
                } catch (_e) {
                    // Auto-lock failed silently
                } finally {
                    try { await BleClient.disconnect(BLE_MAC); } catch (_e) {}
                    setDoorState('locked');
                    setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
                }
            }, 5500);

        } catch (_err) {
            setTimeout(() => {
                setDoorState('locked');
                setLastDoorUpdate(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }));
            }, 5500);
        } finally {
            if (shouldDisconnect) {
                try { await BleClient.disconnect(BLE_MAC); } catch (_e) {}
            }
        }
    };

    // ── PIN Verification Handler ──────────────────────────────────────────────
    const handleDoorPinSubmit = useCallback(() => {
        if (doorPinCooldown > 0) return;
        if (doorPinInput === ADMIN_DOOR_PIN) {
            triggerDoorUnlock();
            setDoorPinInput('');
            setDoorPinAttempts(0);
            setDoorPinError('');
            setView('home');
        } else {
            const newAttempts = doorPinAttempts + 1;
            setDoorPinAttempts(newAttempts);
            setDoorPinInput('');
            if (newAttempts >= MAX_PIN_ATTEMPTS) {
                setDoorPinError('Too many failed attempts. Locked for ' + PIN_COOLDOWN_SECONDS + 's');
                setDoorPinCooldown(PIN_COOLDOWN_SECONDS);
            } else {
                setDoorPinError('Invalid PIN (' + (MAX_PIN_ATTEMPTS - newAttempts) + ' attempts remaining)');
            }
        }
    }, [doorPinInput, doorPinAttempts, doorPinCooldown]);

    const handlePinKeyPress = useCallback((key) => {
        if (key === 'delete') {
            setDoorPinInput(prev => prev.slice(0, -1));
        } else if (key === 'submit') {
            handleDoorPinSubmit();
        } else if (doorPinInput.length < 4) {
            setDoorPinInput(prev => prev + key);
        }
    }, [doorPinInput, handleDoorPinSubmit]);

    // ── PIN Cooldown Timer ────────────────────────────────────────────────────
    useEffect(() => {
        if (doorPinCooldown <= 0) return;
        const timer = setInterval(() => {
            setDoorPinCooldown(prev => {
                if (prev <= 1) {
                    setDoorPinAttempts(0);
                    setDoorPinError('');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [doorPinCooldown]);

    const [biometricStatus, setBiometricStatus] = useState('checking'); // 'online', 'offline', 'checking'

    useEffect(() => {
        let statusInterval;
        const checkBle = async () => {
            try {
                try { await BleClient.initialize(); } catch (_ie) {}

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
                        (scanResult) => {
                            if (scanResult.device.deviceId === BLE_MAC || scanResult.device.name?.includes('SmartDoor')) {
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
            } catch (_e) {
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
            } catch (_e) {
                setBiometricStatus('offline');
            }
        };

        const initSystem = () => {
            checkBle();
            checkBiometricHealth();
        };

        initSystem();
        statusInterval = setInterval(() => { checkBiometricHealth(); }, 60000);
        
        // Initialize local face recognition
        localFaceService.initialize();
        localFaceService.syncDescriptors(API_BASE);
        const syncInterval = setInterval(() => localFaceService.syncDescriptors(API_BASE), 300000);
        
        // Poll for remote unlock commands from the Admin Panel
        const remoteUnlockInterval = setInterval(async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/door/poll`, { timeout: 3000 });
                if (res.data.unlock) {
                    triggerDoorUnlock();
                }
            } catch (_e) {}
        }, 1500);
        
        return () => {
            clearInterval(statusInterval);
            clearInterval(syncInterval);
            clearInterval(remoteUnlockInterval);
            BleClient.stopLEScan().catch(() => {});
        };
    }, []);

    useEffect(() => {
        let timeout;
        if (view === 'home' && isScanning) {
            timeout = setTimeout(() => {
                setIsScanning(false);
                setMessage('Scan timed out. Please try again.');
            }, 15000);
        }
        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [isScanning, view]);

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
        setIsScanning(false);
        setVerifyMethod('face');
        setLoading(false);
        setMessage('');
        setResult(null);
        setSearchTerm('');
        setCountdown(RESET_DELAY);
    };

    // ── Face Scan Live Feed ───────────────────────────────────────────────────
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

                if (view === 'home' && isScanning && verifyMethod === 'face') {
                    interval = setInterval(captureAndVerify, CAPTURE_INTERVAL_MS);
                }
            } catch (_err) {
                setMessage('Camera unavailable');
            }
        };

        if ((view === 'home' && isScanning && verifyMethod === 'face') || view === 'admin_scan') {
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
    }, [view, verifyMethod, isScanning]);

    const captureAndVerify = async () => {
        if (!videoRef.current || view !== 'home' || !isScanning || verifyMethod !== 'face' || loading) return;
        if (verifyInFlightRef.current) return;
        verifyInFlightRef.current = true;

        try {
            // ── FAST PATH: Local on-device matching ──────────────────────
            const localStatus = localFaceService.getStatus();
            if (localStatus.modelsLoaded && localStatus.descriptorCount > 0) {
                const localResult = await localFaceService.matchFace(videoRef.current);
                if (localResult.matched && (localResult.confidence === 'high' || localResult.confidence === 'medium')) {
                    // Local match — instant unlock + async attendance log
                    triggerDoorUnlock();
                    const now = new Date();
                    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

                    try {
                        const attendRes = await axios.post(`${API_BASE}/api/attendance/mark`, {
                            employee_id: localResult.employee.employee_id,
                            method: 'face_local',
                            device_id: 'office_terminal',
                        }, { timeout: 10000 });
                        const aData = attendRes.data || {};
                        const isCheckout = !!(aData.check_out);
                        setResult({
                            name: localResult.employee.name,
                            time: aData.check_in ? new Date(aData.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : timeStr,
                            checkoutTime: aData.check_out ? new Date(aData.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : timeStr,
                            workingHours: aData.working_hours != null ? formatWorkHours(aData.working_hours) : null,
                            isCheckout,
                        });
                        setView(isCheckout ? 'checkout' : 'checkin');
                    } catch (_attendErr) {
                        // Backend logging failed, but door is already unlocked
                        setResult({ name: localResult.employee.name, time: timeStr, checkoutTime: timeStr, workingHours: null, isCheckout: false });
                        setView('checkin');
                    }
                    return;
                }
            }

            // ── SLOW PATH: Cloud fallback ────────────────────────────────
            const canvas = document.createElement('canvas');
            const MAX_W = 480;
            const srcW = videoRef.current.videoWidth || 640;
            const srcH = videoRef.current.videoHeight || 480;
            const scale = Math.min(1, MAX_W / srcW);
            canvas.width = Math.round(srcW * scale);
            canvas.height = Math.round(srcH * scale);
            if (canvas.width === 0) return;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.6));
            if (!blob) return;
            // Keep the same frame for the success screen (shown with date/time stamp)
            const frameDataUrl = canvas.toDataURL('image/jpeg', 0.7);

            try {
                const formData = new FormData();
                formData.append('file', blob, 'verify.jpg');
                appendLocation(formData);
                
                const res = await axios.post(`${API_BASE}/api/biometrics/face/verify`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
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
                        // Captured frame + server timestamp for the on-screen photo stamp
                        photo: frameDataUrl,
                        employeeId: res.data.user?.employee_id || res.data.employeeId || '',
                        capturedAt: (isCheckout ? res.data.check_out : res.data.check_in) || now.toISOString(),
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
        } finally {
            verifyInFlightRef.current = false;
        }
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
                    // Also generate local face-api.js descriptor for fast on-device matching
                    await localFaceService.enrollFace(videoRef.current, selectedEmp);
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
            
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }

            await new Promise(r => setTimeout(r, 1000));

            const avail = await NativeBiometric.isAvailable();
            if (!avail.isAvailable) {
                alert('Fingerprint sensor not detected.');
                setVerifyMethod('face');
                return;
            }

            const authParams = {
                reason: 'Authenticate for attendance tracking',
                title: 'EngLabs Attendance Tracker (EAT)',
                subtitle: 'Scan your fingerprint',
                negativeButtonText: 'Cancel',
            };

            try {
                await NativeBiometric.verifyIdentity(authParams);
            } catch (authError) {
                alert('Fingerprint Error: ' + (authError.message || JSON.stringify(authError)));
                setVerifyMethod('face');
                return;
            }
            
            if (!employees || employees.length === 0) {
                alert('Verification Success, but no employee records found in app state. Please wait for sync.');
                setVerifyMethod('face');
                return;
            }

            try {
                setLoading(true);
                const emp = employees[0]; 
                
                const res = await axios.post(`${API_BASE}/api/attendance/mark`, {
                    employee_id: emp.employee_id || emp.id,
                    method: 'fingerprint',
                    device_id: 'office_terminal',
                }, { timeout: 10000 });
                
                const data = res.data || {};

                const isCheckout = !!(data.check_out);
                const now = new Date();
                
                const safeTime = (dateStr) => {
                    try {
                        if (!dateStr) return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        const d = new Date(dateStr);
                        if (isNaN(d.getTime())) return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
                    } catch (_e) {
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
                alert('Server Error: ' + (postErr.message || 'Could not reach backend'));
                setVerifyMethod('face');
            }
        } catch (err) {
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
                            <div className="flex items-center gap-2.5">
                                <div className="relative flex items-center justify-center">
                                    <svg className="w-8 h-8 text-[#52b39a]" viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M 11.9 57.65 C 11.78 58.05, 11.84 58.79, 11.90 59.15 C 11.96 59.51, 11.81 59.26, 12.25 59.80 C 12.69 60.34, 13.50 61.34, 14.52 62.38 C 15.54 63.42, 16.82 64.83, 18.36 66.05 C 19.90 67.27, 22.05 68.74, 23.76 69.71 C 25.47 70.68, 27.07 71.29, 28.64 71.86 C 30.21 72.43, 31.93 72.86, 33.18 73.15 C 34.43 73.44, 34.77 73.51, 36.14 73.58 C 37.51 73.65, 40.24 73.22, 41.37 73.58 C 42.50 73.94, 42.18 74.88, 42.94 75.74 C 43.70 76.60, 44.68 77.67, 45.90 78.75 C 47.12 79.83, 48.63 81.12, 50.26 82.20 C 51.89 83.28, 53.81 84.38, 55.67 85.21 C 57.53 86.03, 59.59 86.72, 61.42 87.15 C 63.25 87.58, 64.70 87.76, 66.65 87.80 C 68.60 87.84, 71.44 87.59, 73.10 87.37 C 74.76 87.16, 75.17 86.98, 76.59 86.51 C 78.01 86.04, 80.04 85.36, 81.64 84.57 C 83.24 83.78, 85.37 82.31, 86.18 81.77 C 87.00 81.23, 86.42 81.41, 86.53 81.34 C 86.64 81.27, 86.61 81.56, 86.87 81.34 C 87.13 81.12, 87.92 80.58, 88.10 80.04 C 88.27 79.50, 88.04 78.50, 87.92 78.11 C 87.80 77.72, 87.63 77.79, 87.40 77.68 C 87.17 77.57, 87.34 77.03, 86.53 77.46 C 85.72 77.89, 83.94 79.44, 82.52 80.26 C 81.09 81.09, 79.14 81.91, 77.98 82.41 C 76.82 82.91, 76.70 82.98, 75.54 83.27 C 74.38 83.56, 72.20 83.96, 71.01 84.14 C 69.82 84.32, 69.47 84.35, 68.39 84.35 C 67.31 84.35, 66.25 84.43, 64.56 84.14 C 62.88 83.85, 59.65 83.06, 58.28 82.63 C 56.91 82.20, 57.00 81.84, 56.36 81.55 C 55.72 81.26, 55.29 81.34, 54.45 80.91 C 53.61 80.48, 52.07 79.51, 51.31 78.97 C 50.55 78.43, 50.38 78.04, 49.91 77.68 C 49.44 77.32, 49.13 77.31, 48.52 76.81 C 47.91 76.31, 46.77 75.30, 46.25 74.66 C 45.73 74.02, 44.94 73.37, 45.38 72.94 C 45.82 72.51, 48.14 72.05, 48.87 72.08 C 49.60 72.11, 49.42 72.86, 49.74 73.15 C 50.06 73.44, 50.43 73.51, 50.78 73.80 C 51.13 74.09, 50.96 74.27, 51.83 74.88 C 52.70 75.49, 55.22 77.03, 56.01 77.46 C 56.80 77.89, 56.05 77.24, 56.54 77.46 C 57.03 77.67, 57.99 78.36, 58.98 78.75 C 59.97 79.14, 61.22 79.54, 62.47 79.83 C 63.72 80.12, 65.12 80.37, 66.48 80.48 C 67.84 80.59, 69.03 80.66, 70.66 80.48 C 72.29 80.30, 75.02 79.69, 76.24 79.40 C 77.46 79.11, 77.49 79.00, 77.98 78.75 C 78.47 78.50, 78.47 78.28, 79.20 77.89 C 79.93 77.50, 81.47 76.88, 82.34 76.38 C 83.21 75.88, 84.02 75.24, 84.43 74.88 C 84.84 74.52, 84.75 74.63, 84.78 74.23 C 84.81 73.84, 84.72 72.91, 84.61 72.51 C 84.50 72.12, 84.38 71.97, 84.09 71.86 C 83.80 71.75, 83.70 71.43, 82.86 71.86 C 82.02 72.29, 80.37 73.72, 79.03 74.44 C 77.69 75.16, 76.32 75.74, 74.84 76.17 C 73.36 76.60, 71.48 76.89, 70.14 77.03 C 68.80 77.17, 68.04 77.14, 66.82 77.03 C 65.60 76.92, 63.94 76.63, 62.81 76.38 C 61.68 76.13, 60.99 75.88, 60.03 75.52 C 59.07 75.16, 58.28 74.91, 57.06 74.23 C 55.84 73.55, 53.48 72.08, 52.70 71.43 C 51.92 70.78, 52.29 70.56, 52.35 70.35 C 52.41 70.13, 52.27 70.61, 53.05 70.14 C 53.83 69.67, 55.78 68.55, 57.06 67.55 C 58.34 66.55, 59.59 65.33, 60.72 64.11 C 61.85 62.89, 62.87 61.67, 63.86 60.23 C 64.85 58.79, 65.95 56.85, 66.65 55.49 C 67.35 54.13, 67.55 53.56, 68.04 52.05 C 68.53 50.54, 69.26 47.89, 69.61 46.45 C 69.96 45.01, 69.99 44.65, 70.14 43.43 C 70.29 42.21, 70.43 40.59, 70.49 39.12 C 70.55 37.65, 70.61 36.29, 70.49 34.60 C 70.37 32.91, 70.05 30.47, 69.79 29.00 C 69.53 27.53, 69.30 26.92, 68.92 25.77 C 68.54 24.62, 68.07 23.22, 67.52 22.11 C 66.97 21.00, 66.18 19.91, 65.60 19.09 C 65.02 18.27, 64.62 17.77, 64.04 17.16 C 63.46 16.55, 62.88 16.00, 62.12 15.43 C 61.36 14.86, 60.43 14.18, 59.50 13.71 C 58.57 13.24, 57.33 12.88, 56.54 12.63 C 55.75 12.38, 55.69 12.27, 54.79 12.20 C 53.89 12.13, 52.26 12.09, 51.13 12.20 C 50.00 12.31, 48.99 12.56, 48.00 12.85 C 47.01 13.14, 46.20 13.39, 45.21 13.93 C 44.22 14.47, 42.91 15.43, 42.07 16.08 C 41.23 16.72, 40.91 16.98, 40.15 17.80 C 39.39 18.63, 38.37 19.77, 37.53 21.03 C 36.69 22.29, 35.70 24.12, 35.09 25.34 C 34.48 26.56, 34.22 27.39, 33.87 28.36 C 33.52 29.33, 33.14 30.58, 33.00 31.15 C 32.86 31.72, 33.06 31.58, 33.00 31.80 C 32.94 32.02, 32.82 31.70, 32.65 32.45 C 32.48 33.20, 32.13 35.06, 31.96 36.32 C 31.79 37.58, 31.67 38.27, 31.61 39.99 C 31.55 41.71, 31.55 44.90, 31.61 46.66 C 31.67 48.42, 31.61 48.49, 31.96 50.54 C 32.31 52.59, 33.21 57.00, 33.70 58.94 C 34.19 60.88, 34.75 61.52, 34.92 62.17 C 35.09 62.82, 35.15 62.85, 34.74 62.81 C 34.33 62.77, 33.20 62.17, 32.48 61.95 C 31.75 61.73, 31.38 61.92, 30.39 61.52 C 29.40 61.13, 27.95 60.48, 26.55 59.58 C 25.16 58.68, 23.07 57.00, 22.02 56.14 C 20.97 55.28, 20.73 54.96, 20.27 54.42 C 19.80 53.88, 19.61 53.34, 19.23 52.91 C 18.85 52.48, 18.42 52.01, 18.01 51.83 C 17.60 51.65, 17.11 51.65, 16.79 51.83 C 16.47 52.01, 16.18 52.48, 16.09 52.91 C 16.00 53.34, 15.97 53.85, 16.26 54.42 C 16.55 54.99, 17.10 55.56, 17.83 56.35 C 18.56 57.14, 19.78 58.36, 20.62 59.15 C 21.46 59.94, 22.34 60.70, 22.89 61.09 C 23.44 61.49, 23.41 61.20, 23.93 61.52 C 24.45 61.84, 24.95 62.42, 26.03 63.03 C 27.11 63.64, 28.97 64.64, 30.39 65.18 C 31.81 65.72, 33.38 66.01, 34.57 66.26 C 35.76 66.51, 36.16 66.65, 37.53 66.69 C 38.90 66.73, 41.34 66.62, 42.76 66.48 C 44.18 66.34, 45.15 66.08, 46.08 65.83 C 47.01 65.58, 47.47 65.40, 48.34 64.97 C 49.21 64.54, 50.67 63.57, 51.31 63.25 C 51.95 62.93, 51.34 63.68, 52.18 63.03 C 53.02 62.38, 55.17 60.55, 56.36 59.37 C 57.55 58.18, 58.37 57.36, 59.33 55.92 C 60.29 54.48, 61.45 52.19, 62.12 50.75 C 62.79 49.31, 63.02 48.42, 63.34 47.31 C 63.66 46.20, 63.84 45.27, 64.04 44.08 C 64.24 42.89, 64.47 41.71, 64.56 40.20 C 64.65 38.69, 64.65 36.47, 64.56 35.03 C 64.47 33.59, 64.27 32.74, 64.04 31.59 C 63.81 30.44, 63.39 28.93, 63.16 28.14 C 62.93 27.35, 62.99 27.50, 62.64 26.85 C 62.29 26.20, 61.68 25.09, 61.07 24.26 C 60.46 23.43, 59.59 22.46, 58.98 21.89 C 58.37 21.32, 58.05 21.14, 57.41 20.82 C 56.77 20.50, 56.22 20.14, 55.14 19.96 C 54.06 19.78, 52.09 19.63, 50.96 19.74 C 49.83 19.85, 49.10 20.28, 48.34 20.60 C 47.59 20.92, 47.10 21.21, 46.43 21.68 C 45.76 22.15, 45.03 22.72, 44.33 23.40 C 43.63 24.08, 42.88 24.84, 42.24 25.77 C 41.60 26.70, 41.02 27.92, 40.50 29.00 C 39.98 30.08, 39.42 31.40, 39.10 32.23 C 38.78 33.05, 38.81 32.84, 38.58 33.95 C 38.35 35.06, 37.91 37.33, 37.71 38.91 C 37.51 40.49, 37.39 42.03, 37.36 43.43 C 37.33 44.83, 37.33 45.48, 37.53 47.31 C 37.73 49.14, 38.17 52.48, 38.58 54.42 C 38.99 56.36, 39.53 57.72, 39.97 58.94 C 40.41 60.16, 41.00 61.20, 41.20 61.74 C 41.41 62.28, 41.14 62.03, 41.20 62.17 C 41.26 62.31, 41.54 62.46, 41.54 62.60 C 41.54 62.74, 41.72 62.96, 41.20 63.03 C 40.68 63.10, 38.93 63.10, 38.41 63.03 C 37.89 62.96, 38.35 63.32, 38.06 62.60 C 37.77 61.88, 37.13 60.23, 36.66 58.72 C 36.19 57.21, 35.62 55.16, 35.27 53.55 C 34.92 51.93, 34.72 50.21, 34.57 49.03 C 34.42 47.85, 34.43 47.96, 34.40 46.45 C 34.37 44.94, 34.25 42.11, 34.40 39.99 C 34.55 37.87, 34.89 35.54, 35.27 33.74 C 35.65 31.95, 36.25 30.41, 36.66 29.22 C 37.07 28.03, 37.33 27.42, 37.71 26.63 C 38.09 25.84, 38.17 25.56, 38.93 24.48 C 39.69 23.40, 41.31 21.21, 42.24 20.17 C 43.17 19.13, 43.84 18.73, 44.51 18.23 C 45.18 17.73, 45.20 17.59, 46.25 17.16 C 47.30 16.73, 49.39 15.90, 50.78 15.65 C 52.17 15.40, 53.52 15.51, 54.62 15.65 C 55.72 15.79, 56.54 16.12, 57.41 16.51 C 58.28 16.91, 59.38 17.77, 59.85 18.02 C 60.32 18.27, 59.85 17.77, 60.20 18.02 C 60.55 18.27, 61.30 18.84, 61.94 19.52 C 62.58 20.20, 63.37 21.03, 64.04 22.11 C 64.71 23.19, 65.49 24.91, 65.95 25.99 C 66.41 27.07, 66.53 27.17, 66.82 28.57 C 67.11 29.97, 67.55 32.49, 67.70 34.39 C 67.85 36.29, 67.82 38.20, 67.70 39.99 C 67.58 41.78, 67.26 43.68, 67.00 45.15 C 66.74 46.62, 66.77 47.06, 66.13 48.82 C 65.49 50.58, 63.97 54.09, 63.16 55.71 C 62.35 57.33, 62.06 57.43, 61.25 58.51 C 60.44 59.59, 59.09 61.27, 58.28 62.17 C 57.47 63.07, 57.41 63.10, 56.36 63.89 C 55.31 64.68, 53.16 66.19, 52.00 66.91 C 50.84 67.63, 50.06 67.95, 49.39 68.20 C 48.72 68.45, 48.41 68.27, 48.00 68.41 C 47.59 68.55, 47.97 68.77, 46.95 69.06 C 45.93 69.35, 43.92 70.00, 41.89 70.14 C 39.86 70.28, 36.80 70.17, 34.74 69.92 C 32.68 69.67, 30.53 68.95, 29.51 68.63 C 28.49 68.31, 28.87 68.09, 28.64 67.98 C 28.41 67.87, 28.76 68.23, 28.12 67.98 C 27.48 67.73, 25.83 67.02, 24.81 66.48 C 23.79 65.94, 22.92 65.43, 22.02 64.75 C 21.12 64.07, 20.10 62.95, 19.40 62.38 C 18.70 61.81, 18.76 62.24, 17.83 61.31 C 16.90 60.38, 14.60 57.57, 13.82 56.78 C 13.04 55.99, 13.33 56.57, 13.13 56.57 C 12.93 56.57, 12.80 56.60, 12.60 56.78 C 12.39 56.96, 12.02 57.25, 11.90 57.65 Z M 56.19 24.05 C 56.86 24.34, 57.03 24.37, 57.58 24.91 C 58.13 25.45, 58.89 26.13, 59.50 27.28 C 60.11 28.43, 60.87 30.51, 61.25 31.80 C 61.63 33.09, 61.68 33.66, 61.77 35.03 C 61.86 36.40, 61.83 38.66, 61.77 39.99 C 61.71 41.32, 61.59 42.03, 61.42 43.00 C 61.25 43.97, 60.95 45.05, 60.72 45.80 C 60.49 46.55, 60.17 47.05, 60.03 47.52 C 59.89 47.99, 60.08 47.99, 59.85 48.60 C 59.62 49.21, 59.01 50.46, 58.63 51.18 C 58.25 51.90, 58.34 51.90, 57.58 52.91 C 56.82 53.92, 55.06 56.18, 54.10 57.22 C 53.14 58.26, 52.79 58.47, 51.83 59.15 C 50.87 59.83, 49.27 60.81, 48.34 61.31 C 47.41 61.81, 46.83 61.99, 46.25 62.17 C 45.67 62.35, 45.41 62.96, 44.86 62.38 C 44.31 61.80, 43.26 59.40, 42.94 58.72 C 42.62 58.04, 43.06 58.61, 42.94 58.29 C 42.82 57.97, 42.50 57.53, 42.24 56.78 C 41.98 56.03, 41.66 55.06, 41.37 53.77 C 41.08 52.48, 40.67 51.22, 40.50 49.03 C 40.33 46.84, 40.23 42.75, 40.32 40.63 C 40.41 38.51, 40.76 37.58, 41.02 36.32 C 41.28 35.06, 41.57 34.06, 41.89 33.09 C 42.21 32.12, 42.56 31.26, 42.94 30.51 C 43.32 29.76, 43.55 29.39, 44.16 28.57 C 44.77 27.75, 45.96 26.24, 46.60 25.56 C 47.24 24.88, 47.24 24.88, 48.00 24.48 C 48.76 24.09, 50.32 23.37, 51.13 23.19 C 51.94 23.01, 52.47 23.40, 52.88 23.40 C 53.29 23.40, 53.02 23.08, 53.57 23.19 C 54.12 23.30, 55.52 23.76, 56.19 24.05 Z " fill="currentColor" style={{ fill: 'currentColor' }} fillRule="evenodd" />
                                    </svg>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-black text-base tracking-tight text-[#24546e] leading-none">Eng<span className="text-[#52b39a] font-normal">labs</span></span>
                                    <span className="text-[6px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">ATTENDANCE v{pkg.version}</span>
                                </div>
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
                            {isScanning && (
                                <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[8px] font-black text-white uppercase tracking-widest">CAMERA ACTIVE</span>
                                </div>
                            )}
                            <button className="absolute top-4 right-4 z-10 p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white/70">
                                <Zap size={14} />
                            </button>
                            
                            {verifyMethod === 'face' && isScanning ? (
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

                                    {/* Cancel Button */}
                                    <button 
                                        onClick={() => setIsScanning(false)}
                                        className="absolute bottom-12 right-4 z-10 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-white/90 text-[10px] font-black uppercase tracking-wider hover:bg-black/80 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-6 relative">
                                    <svg className="w-12 h-12 text-[#52b39a]" viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M 11.9 57.65 C 11.78 58.05, 11.84 58.79, 11.90 59.15 C 11.96 59.51, 11.81 59.26, 12.25 59.80 C 12.69 60.34, 13.50 61.34, 14.52 62.38 C 15.54 63.42, 16.82 64.83, 18.36 66.05 C 19.90 67.27, 22.05 68.74, 23.76 69.71 C 25.47 70.68, 27.07 71.29, 28.64 71.86 C 30.21 72.43, 31.93 72.86, 33.18 73.15 C 34.43 73.44, 34.77 73.51, 36.14 73.58 C 37.51 73.65, 40.24 73.22, 41.37 73.58 C 42.50 73.94, 42.18 74.88, 42.94 75.74 C 43.70 76.60, 44.68 77.67, 45.90 78.75 C 47.12 79.83, 48.63 81.12, 50.26 82.20 C 51.89 83.28, 53.81 84.38, 55.67 85.21 C 57.53 86.03, 59.59 86.72, 61.42 87.15 C 63.25 87.58, 64.70 87.76, 66.65 87.80 C 68.60 87.84, 71.44 87.59, 73.10 87.37 C 74.76 87.16, 75.17 86.98, 76.59 86.51 C 78.01 86.04, 80.04 85.36, 81.64 84.57 C 83.24 83.78, 85.37 82.31, 86.18 81.77 C 87.00 81.23, 86.42 81.41, 86.53 81.34 C 86.64 81.27, 86.61 81.56, 86.87 81.34 C 87.13 81.12, 87.92 80.58, 88.10 80.04 C 88.27 79.50, 88.04 78.50, 87.92 78.11 C 87.80 77.72, 87.63 77.79, 87.40 77.68 C 87.17 77.57, 87.34 77.03, 86.53 77.46 C 85.72 77.89, 83.94 79.44, 82.52 80.26 C 81.09 81.09, 79.14 81.91, 77.98 82.41 C 76.82 82.91, 76.70 82.98, 75.54 83.27 C 74.38 83.56, 72.20 83.96, 71.01 84.14 C 69.82 84.32, 69.47 84.35, 68.39 84.35 C 67.31 84.35, 66.25 84.43, 64.56 84.14 C 62.88 83.85, 59.65 83.06, 58.28 82.63 C 56.91 82.20, 57.00 81.84, 56.36 81.55 C 55.72 81.26, 55.29 81.34, 54.45 80.91 C 53.61 80.48, 52.07 79.51, 51.31 78.97 C 50.55 78.43, 50.38 78.04, 49.91 77.68 C 49.44 77.32, 49.13 77.31, 48.52 76.81 C 47.91 76.31, 46.77 75.30, 46.25 74.66 C 45.73 74.02, 44.94 73.37, 45.38 72.94 C 45.82 72.51, 48.14 72.05, 48.87 72.08 C 49.60 72.11, 49.42 72.86, 49.74 73.15 C 50.06 73.44, 50.43 73.51, 50.78 73.80 C 51.13 74.09, 50.96 74.27, 51.83 74.88 C 52.70 75.49, 55.22 77.03, 56.01 77.46 C 56.80 77.89, 56.05 77.24, 56.54 77.46 C 57.03 77.67, 57.99 78.36, 58.98 78.75 C 59.97 79.14, 61.22 79.54, 62.47 79.83 C 63.72 80.12, 65.12 80.37, 66.48 80.48 C 67.84 80.59, 69.03 80.66, 70.66 80.48 C 72.29 80.30, 75.02 79.69, 76.24 79.40 C 77.46 79.11, 77.49 79.00, 77.98 78.75 C 78.47 78.50, 78.47 78.28, 79.20 77.89 C 79.93 77.50, 81.47 76.88, 82.34 76.38 C 83.21 75.88, 84.02 75.24, 84.43 74.88 C 84.84 74.52, 84.75 74.63, 84.78 74.23 C 84.81 73.84, 84.72 72.91, 84.61 72.51 C 84.50 72.12, 84.38 71.97, 84.09 71.86 C 83.80 71.75, 83.70 71.43, 82.86 71.86 C 82.02 72.29, 80.37 73.72, 79.03 74.44 C 77.69 75.16, 76.32 75.74, 74.84 76.17 C 73.36 76.60, 71.48 76.89, 70.14 77.03 C 68.80 77.17, 68.04 77.14, 66.82 77.03 C 65.60 76.92, 63.94 76.63, 62.81 76.38 C 61.68 76.13, 60.99 75.88, 60.03 75.52 C 59.07 75.16, 58.28 74.91, 57.06 74.23 C 55.84 73.55, 53.48 72.08, 52.70 71.43 C 51.92 70.78, 52.29 70.56, 52.35 70.35 C 52.41 70.13, 52.27 70.61, 53.05 70.14 C 53.83 69.67, 55.78 68.55, 57.06 67.55 C 58.34 66.55, 59.59 65.33, 60.72 64.11 C 61.85 62.89, 62.87 61.67, 63.86 60.23 C 64.85 58.79, 65.95 56.85, 66.65 55.49 C 67.35 54.13, 67.55 53.56, 68.04 52.05 C 68.53 50.54, 69.26 47.89, 69.61 46.45 C 69.96 45.01, 69.99 44.65, 70.14 43.43 C 70.29 42.21, 70.43 40.59, 70.49 39.12 C 70.55 37.65, 70.61 36.29, 70.49 34.60 C 70.37 32.91, 70.05 30.47, 69.79 29.00 C 69.53 27.53, 69.30 26.92, 68.92 25.77 C 68.54 24.62, 68.07 23.22, 67.52 22.11 C 66.97 21.00, 66.18 19.91, 65.60 19.09 C 65.02 18.27, 64.62 17.77, 64.04 17.16 C 63.46 16.55, 62.88 16.00, 62.12 15.43 C 61.36 14.86, 60.43 14.18, 59.50 13.71 C 58.57 13.24, 57.33 12.88, 56.54 12.63 C 55.75 12.38, 55.69 12.27, 54.79 12.20 C 53.89 12.13, 52.26 12.09, 51.13 12.20 C 50.00 12.31, 48.99 12.56, 48.00 12.85 C 47.01 13.14, 46.20 13.39, 45.21 13.93 C 44.22 14.47, 42.91 15.43, 42.07 16.08 C 41.23 16.72, 40.91 16.98, 40.15 17.80 C 39.39 18.63, 38.37 19.77, 37.53 21.03 C 36.69 22.29, 35.70 24.12, 35.09 25.34 C 34.48 26.56, 34.22 27.39, 33.87 28.36 C 33.52 29.33, 33.14 30.58, 33.00 31.15 C 32.86 31.72, 33.06 31.58, 33.00 31.80 C 32.94 32.02, 32.82 31.70, 32.65 32.45 C 32.48 33.20, 32.13 35.06, 31.96 36.32 C 31.79 37.58, 31.67 38.27, 31.61 39.99 C 31.55 41.71, 31.55 44.90, 31.61 46.66 C 31.67 48.42, 31.61 48.49, 31.96 50.54 C 32.31 52.59, 33.21 57.00, 33.70 58.94 C 34.19 60.88, 34.75 61.52, 34.92 62.17 C 35.09 62.82, 35.15 62.85, 34.74 62.81 C 34.33 62.77, 33.20 62.17, 32.48 61.95 C 31.75 61.73, 31.38 61.92, 30.39 61.52 C 29.40 61.13, 27.95 60.48, 26.55 59.58 C 25.16 58.68, 23.07 57.00, 22.02 56.14 C 20.97 55.28, 20.73 54.96, 20.27 54.42 C 19.80 53.88, 19.61 53.34, 19.23 52.91 C 18.85 52.48, 18.42 52.01, 18.01 51.83 C 17.60 51.65, 17.11 51.65, 16.79 51.83 C 16.47 52.01, 16.18 52.48, 16.09 52.91 C 16.00 53.34, 15.97 53.85, 16.26 54.42 C 16.55 54.99, 17.10 55.56, 17.83 56.35 C 18.56 57.14, 19.78 58.36, 20.62 59.15 C 21.46 59.94, 22.34 60.70, 22.89 61.09 C 23.44 61.49, 23.41 61.20, 23.93 61.52 C 24.45 61.84, 24.95 62.42, 26.03 63.03 C 27.11 63.64, 28.97 64.64, 30.39 65.18 C 31.81 65.72, 33.38 66.01, 34.57 66.26 C 35.76 66.51, 36.16 66.65, 37.53 66.69 C 38.90 66.73, 41.34 66.62, 42.76 66.48 C 44.18 66.34, 45.15 66.08, 46.08 65.83 C 47.01 65.58, 47.47 65.40, 48.34 64.97 C 49.21 64.54, 50.67 63.57, 51.31 63.25 C 51.95 62.93, 51.34 63.68, 52.18 63.03 C 53.02 62.38, 55.17 60.55, 56.36 59.37 C 57.55 58.18, 58.37 57.36, 59.33 55.92 C 60.29 54.48, 61.45 52.19, 62.12 50.75 C 62.79 49.31, 63.02 48.42, 63.34 47.31 C 63.66 46.20, 63.84 45.27, 64.04 44.08 C 64.24 42.89, 64.47 41.71, 64.56 40.20 C 64.65 38.69, 64.65 36.47, 64.56 35.03 C 64.47 33.59, 64.27 32.74, 64.04 31.59 C 63.81 30.44, 63.39 28.93, 63.16 28.14 C 62.93 27.35, 62.99 27.50, 62.64 26.85 C 62.29 26.20, 61.68 25.09, 61.07 24.26 C 60.46 23.43, 59.59 22.46, 58.98 21.89 C 58.37 21.32, 58.05 21.14, 57.41 20.82 C 56.77 20.50, 56.22 20.14, 55.14 19.96 C 54.06 19.78, 52.09 19.63, 50.96 19.74 C 49.83 19.85, 49.10 20.28, 48.34 20.60 C 47.59 20.92, 47.10 21.21, 46.43 21.68 C 45.76 22.15, 45.03 22.72, 44.33 23.40 C 43.63 24.08, 42.88 24.84, 42.24 25.77 C 41.60 26.70, 41.02 27.92, 40.50 29.00 C 39.98 30.08, 39.42 31.40, 39.10 32.23 C 38.78 33.05, 38.81 32.84, 38.58 33.95 C 38.35 35.06, 37.91 37.33, 37.71 38.91 C 37.51 40.49, 37.39 42.03, 37.36 43.43 C 37.33 44.83, 37.33 45.48, 37.53 47.31 C 37.73 49.14, 38.17 52.48, 38.58 54.42 C 38.99 56.36, 39.53 57.72, 39.97 58.94 C 40.41 60.16, 41.00 61.20, 41.20 61.74 C 41.41 62.28, 41.14 62.03, 41.20 62.17 C 41.26 62.31, 41.54 62.46, 41.54 62.60 C 41.54 62.74, 41.72 62.96, 41.20 63.03 C 40.68 63.10, 38.93 63.10, 38.41 63.03 C 37.89 62.96, 38.35 63.32, 38.06 62.60 C 37.77 61.88, 37.13 60.23, 36.66 58.72 C 36.19 57.21, 35.62 55.16, 35.27 53.55 C 34.92 51.93, 34.72 50.21, 34.57 49.03 C 34.42 47.85, 34.43 47.96, 34.40 46.45 C 34.37 44.94, 34.25 42.11, 34.40 39.99 C 34.55 37.87, 34.89 35.54, 35.27 33.74 C 35.65 31.95, 36.25 30.41, 36.66 29.22 C 37.07 28.03, 37.33 27.42, 37.71 26.63 C 38.09 25.84, 38.17 25.56, 38.93 24.48 C 39.69 23.40, 41.31 21.21, 42.24 20.17 C 43.17 19.13, 43.84 18.73, 44.51 18.23 C 45.18 17.73, 45.20 17.59, 46.25 17.16 C 47.30 16.73, 49.39 15.90, 50.78 15.65 C 52.17 15.40, 53.52 15.51, 54.62 15.65 C 55.72 15.79, 56.54 16.12, 57.41 16.51 C 58.28 16.91, 59.38 17.77, 59.85 18.02 C 60.32 18.27, 59.85 17.77, 60.20 18.02 C 60.55 18.27, 61.30 18.84, 61.94 19.52 C 62.58 20.20, 63.37 21.03, 64.04 22.11 C 64.71 23.19, 65.49 24.91, 65.95 25.99 C 66.41 27.07, 66.53 27.17, 66.82 28.57 C 67.11 29.97, 67.55 32.49, 67.70 34.39 C 67.85 36.29, 67.82 38.20, 67.70 39.99 C 67.58 41.78, 67.26 43.68, 67.00 45.15 C 66.74 46.62, 66.77 47.06, 66.13 48.82 C 65.49 50.58, 63.97 54.09, 63.16 55.71 C 62.35 57.33, 62.06 57.43, 61.25 58.51 C 60.44 59.59, 59.09 61.27, 58.28 62.17 C 57.47 63.07, 57.41 63.10, 56.36 63.89 C 55.31 64.68, 53.16 66.19, 52.00 66.91 C 50.84 67.63, 50.06 67.95, 49.39 68.20 C 48.72 68.45, 48.41 68.27, 48.00 68.41 C 47.59 68.55, 47.97 68.77, 46.95 69.06 C 45.93 69.35, 43.92 70.00, 41.89 70.14 C 39.86 70.28, 36.80 70.17, 34.74 69.92 C 32.68 69.67, 30.53 68.95, 29.51 68.63 C 28.49 68.31, 28.87 68.09, 28.64 67.98 C 28.41 67.87, 28.76 68.23, 28.12 67.98 C 27.48 67.73, 25.83 67.02, 24.81 66.48 C 23.79 65.94, 22.92 65.43, 22.02 64.75 C 21.12 64.07, 20.10 62.95, 19.40 62.38 C 18.70 61.81, 18.76 62.24, 17.83 61.31 C 16.90 60.38, 14.60 57.57, 13.82 56.78 C 13.04 55.99, 13.33 56.57, 13.13 56.57 C 12.93 56.57, 12.80 56.60, 12.60 56.78 C 12.39 56.96, 12.02 57.25, 11.90 57.65 Z M 56.19 24.05 C 56.86 24.34, 57.03 24.37, 57.58 24.91 C 58.13 25.45, 58.89 26.13, 59.50 27.28 C 60.11 28.43, 60.87 30.51, 61.25 31.80 C 61.63 33.09, 61.68 33.66, 61.77 35.03 C 61.86 36.40, 61.83 38.66, 61.77 39.99 C 61.71 41.32, 61.59 42.03, 61.42 43.00 C 61.25 43.97, 60.95 45.05, 60.72 45.80 C 60.49 46.55, 60.17 47.05, 60.03 47.52 C 59.89 47.99, 60.08 47.99, 59.85 48.60 C 59.62 49.21, 59.01 50.46, 58.63 51.18 C 58.25 51.90, 58.34 51.90, 57.58 52.91 C 56.82 53.92, 55.06 56.18, 54.10 57.22 C 53.14 58.26, 52.79 58.47, 51.83 59.15 C 50.87 59.83, 49.27 60.81, 48.34 61.31 C 47.41 61.81, 46.83 61.99, 46.25 62.17 C 45.67 62.35, 45.41 62.96, 44.86 62.38 C 44.31 61.80, 43.26 59.40, 42.94 58.72 C 42.62 58.04, 43.06 58.61, 42.94 58.29 C 42.82 57.97, 42.50 57.53, 42.24 56.78 C 41.98 56.03, 41.66 55.06, 41.37 53.77 C 41.08 52.48, 40.67 51.22, 40.50 49.03 C 40.33 46.84, 40.23 42.75, 40.32 40.63 C 40.41 38.51, 40.76 37.58, 41.02 36.32 C 41.28 35.06, 41.57 34.06, 41.89 33.09 C 42.21 32.12, 42.56 31.26, 42.94 30.51 C 43.32 29.76, 43.55 29.39, 44.16 28.57 C 44.77 27.75, 45.96 26.24, 46.60 25.56 C 47.24 24.88, 47.24 24.88, 48.00 24.48 C 48.76 24.09, 50.32 23.37, 51.13 23.19 C 51.94 23.01, 52.47 23.40, 52.88 23.40 C 53.29 23.40, 53.02 23.08, 53.57 23.19 C 54.12 23.30, 55.52 23.76, 56.19 24.05 Z " fill="currentColor" style={{ fill: 'currentColor' }} fillRule="evenodd" />
                                    </svg>
                                    <div className="absolute inset-0 rounded-3xl border border-emerald-500/20 animate-ping" style={{ animationDuration: '3s' }} />
                                    
                                    <h3 className="text-lg font-black tracking-tight mb-1">System Standby</h3>
                                    <p className="text-[10px] text-slate-400 uppercase tracking-[0.15em] mb-6 font-bold text-center">Camera off to conserve battery • Tap below to scan</p>
                                    
                                    <div className="grid grid-cols-2 gap-4 w-full max-w-sm relative z-10">
                                        <button 
                                            onClick={() => {
                                                setIsScanning(true);
                                                setMessage('Initializing camera...');
                                            }}
                                            className="py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 transition-all text-white rounded-2xl font-black text-[11px] uppercase tracking-wider shadow-lg shadow-emerald-500/20 flex flex-col items-center gap-1"
                                        >
                                            <Zap size={14} />
                                            Check In
                                        </button>
                                        <button 
                                            onClick={() => {
                                                setIsScanning(true);
                                                setMessage('Initializing camera...');
                                            }}
                                            className="py-3 px-4 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 active:scale-95 transition-all text-white rounded-2xl font-black text-[11px] uppercase tracking-wider border border-slate-600/30 flex flex-col items-center gap-1"
                                        >
                                            <LogOut size={14} />
                                            Check Out
                                        </button>
                                    </div>
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

                        {/* Admin Manual Unlock Button — PIN Protected */}
                        <div className="w-full mt-2">
                            <button 
                                onClick={() => { setView('admin_door_pin'); setDoorPinInput(''); setDoorPinError(''); }}
                                className="w-full py-4 bg-slate-900 hover:bg-slate-800 rounded-[1.25rem] font-black text-white uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                <Unlock size={18} className="text-emerald-400" />
                                Admin Unlock Door
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ── ADMIN DOOR PIN MODAL ── */}
                {view === 'admin_door_pin' && (
                    <motion.div key="admin_door_pin" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-[#f8fafc] flex items-center justify-center p-6">
                        <div className="bg-white border border-slate-200 shadow-xl p-8 rounded-3xl w-full max-w-sm flex flex-col gap-5 items-center">
                            <div className="flex items-center justify-between w-full border-b border-slate-100 pb-4">
                                <h2 className="text-lg font-black flex items-center gap-2"><Hash size={20} className="text-amber-500" /> Door PIN</h2>
                                <button onClick={() => { setView('home'); setDoorPinInput(''); setDoorPinError(''); }} className="p-2 hover:bg-slate-50 rounded-full transition-colors"><X size={20} /></button>
                            </div>

                            {/* PIN Display */}
                            <div data-testid="pin-display" className="flex gap-3 my-2">
                                {[0,1,2,3].map(i => (
                                    <div key={i} className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all ${
                                        i < doorPinInput.length ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-300'
                                    }`}>
                                        {i < doorPinInput.length ? '●' : '○'}
                                    </div>
                                ))}
                            </div>

                            {/* Error Message */}
                            {doorPinError && (
                                <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-red-500 text-xs font-black uppercase tracking-wider text-center">
                                    {doorPinError}
                                </motion.p>
                            )}

                            {/* Cooldown */}
                            {doorPinCooldown > 0 && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-full">
                                    <Lock size={14} className="text-red-500" />
                                    <span className="text-red-600 text-xs font-black uppercase tracking-wider">Locked {doorPinCooldown}s</span>
                                </div>
                            )}

                            {/* Numeric Keypad */}
                            <div className="grid grid-cols-3 gap-3 w-full">
                                {['1','2','3','4','5','6','7','8','9'].map(key => (
                                    <button key={key} data-testid={`pin-key-${key}`}
                                        onClick={() => handlePinKeyPress(key)}
                                        disabled={doorPinCooldown > 0}
                                        className="py-4 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 rounded-2xl text-xl font-black text-slate-800 transition-all border border-slate-200 active:scale-95"
                                    >{key}</button>
                                ))}
                                <button data-testid="pin-key-delete"
                                    onClick={() => handlePinKeyPress('delete')}
                                    disabled={doorPinCooldown > 0}
                                    className="py-4 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 rounded-2xl text-sm font-black text-slate-500 transition-all border border-slate-200 uppercase tracking-wider"
                                >Del</button>
                                <button data-testid="pin-key-0"
                                    onClick={() => handlePinKeyPress('0')}
                                    disabled={doorPinCooldown > 0}
                                    className="py-4 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 rounded-2xl text-xl font-black text-slate-800 transition-all border border-slate-200 active:scale-95"
                                >0</button>
                                <button data-testid="pin-submit"
                                    onClick={() => handlePinKeyPress('submit')}
                                    disabled={doorPinCooldown > 0 || doorPinInput.length !== 4}
                                    className="py-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 rounded-2xl text-sm font-black text-white transition-all uppercase tracking-wider active:scale-95"
                                >Go</button>
                            </div>

                            {/* Cancel Button */}
                            <button onClick={() => { setView('home'); setDoorPinInput(''); setDoorPinError(''); }}
                                className="w-full py-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-500 uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-colors mt-1"
                            >Cancel</button>
                        </div>
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
                            <button onClick={() => { if (adminPin === '2026') { setView('admin_select'); setAdminPin(''); } else { setMessage('Invalid PIN'); setTimeout(() => setMessage(''), 2000); } }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 rounded-2xl font-black text-white uppercase tracking-widest transition-colors flex items-center justify-center gap-2"><Unlock size={18} /> Authenticate</button>
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

                        {/* Captured photo with stamp (face scans), else pulsing ring + icon */}
                        {result?.photo ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="relative w-64 max-w-[80vw] rounded-2xl overflow-hidden border-4 border-emerald-100 shadow-xl shadow-emerald-500/20 bg-black">
                                <img src={result.photo} alt="" className="w-full h-auto block" />
                                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-left">
                                    <div className="text-white text-sm font-bold leading-tight truncate">{result.name}{result.employeeId ? `  (${result.employeeId})` : ''}</div>
                                    <div className="text-emerald-300 text-xs font-black tracking-wider">
                                        CHECK IN  {new Date(result.capturedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} IST
                                    </div>
                                </div>
                                <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow">
                                    <CheckCircle2 size={18} className="text-white" />
                                </div>
                            </motion.div>
                        ) : (
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
                        )}

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

                        {result?.photo ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="relative w-64 max-w-[80vw] rounded-2xl overflow-hidden border-4 border-indigo-100 shadow-xl shadow-indigo-500/20 bg-black">
                                <img src={result.photo} alt="" className="w-full h-auto block" />
                                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-left">
                                    <div className="text-white text-sm font-bold leading-tight truncate">{result.name}{result.employeeId ? `  (${result.employeeId})` : ''}</div>
                                    <div className="text-indigo-300 text-xs font-black tracking-wider">
                                        CHECK OUT  {new Date(result.capturedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} IST
                                    </div>
                                </div>
                                <div className="absolute top-2 right-2 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow">
                                    <LogOut size={16} className="text-white ml-0.5" />
                                </div>
                            </motion.div>
                        ) : (
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
                        )}

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
