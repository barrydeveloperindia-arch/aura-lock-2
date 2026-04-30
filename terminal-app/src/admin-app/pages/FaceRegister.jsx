import React, { useRef, useState, useEffect } from 'react';
import { Camera, ShieldCheck, AlertCircle, RefreshCw, Loader2, Lock, Shield, Activity, Smartphone, Upload } from 'lucide-react';
import { apiService } from '../services/api';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

export default function FaceRegister() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [name, setName] = useState('');
    const [capturedImage, setCapturedImage] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const fileInputRef = useRef(null);

    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (!navigator.mediaDevices?.getUserMedia && !isSecure) {
                setStatus({ type: 'error', message: 'Camera requires HTTPS or Localhost. Use "Direct Cam" or "Mobile Capture" below.' });
                return;
            }

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
            });
            setStream(mediaStream);
            if (videoRef.current) videoRef.current.srcObject = mediaStream;
        } catch (err) {
            setStatus({ type: 'error', message: 'Browser camera blocked. Use "Direct Cam" or "Mobile Capture" below.' });
        }
    };

    const captureWithCapacitor = async () => {
        try {
            setLoading(true);
            const image = await CapCamera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera
            });
            setCapturedImage(image.dataUrl);
            stopCamera();
        } catch (err) {
            console.warn("Capacitor Camera cancelled or failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setCapturedImage(event.target.result);
            stopCamera();
        };
        reader.readAsDataURL(file);
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);

            const imageData = canvasRef.current.toDataURL('image/jpeg');
            setCapturedImage(imageData);
            stopCamera();
        }
    };

    const handleRegister = async () => {
        if (!name || !capturedImage) {
            setStatus({ type: 'error', message: 'Please provide both name and photo.' });
            return;
        }

        setLoading(true);
        setStatus({ type: '', message: '' });

        try {
            const response = await fetch(capturedImage);
            const blob = await response.blob();

            const finalEmployeeId = `EMP-${Date.now().toString().slice(-6)}`;
            const generatedEmail = `${name.toLowerCase().replace(/\s+/g, '.')}.${finalEmployeeId.toLowerCase()}@internal.com`;

            const biometricResult = await apiService.registerFace(blob, finalEmployeeId, generatedEmail, name);

            if (biometricResult.success) {
                setStatus({ type: 'success', message: 'User Identity Fully Registered!' });
                setName('');
                setCapturedImage(null);
                startCamera();
            } else {
                throw new Error(biometricResult.message || 'Biometric analysis failed');
            }
        } catch (err) {
            console.error("Registration error:", err);
            const errorMsg = err.response?.data?.message || err.message || 'Registration failed.';
            setStatus({ type: 'error', message: errorMsg });
        } finally {
            setLoading(false);
        }
    };

    const retake = () => {
        setCapturedImage(null);
        startCamera();
    };

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-160px)]">
            <div className="card max-w-4xl w-full !p-0 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2">
                    {/* LEFT SIDE: SCANNER */}
                    <div className="p-6 md:p-8 bg-[#111827] flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-white/5">
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl mb-6">
                            {capturedImage ? (
                                <img src={capturedImage} className="w-full h-full object-cover" alt="Captured" />
                            ) : (
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                            )}

                            {!capturedImage && (
                                <div className="absolute inset-0 pointer-events-none border-2 border-blue-500/20 rounded-2xl m-8">
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-0.5 bg-blue-500/40 animate-pulse"></div>
                                </div>
                            )}

                            {loading && (
                                <div className="absolute inset-0 bg-[#0f172a]/80 backdrop-blur-sm flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                </div>
                            )}
                        </div>

                        {!capturedImage ? (
                            <div className="w-full space-y-3">
                                <div className="flex gap-2 w-full">
                                    <button onClick={capturePhoto} className="btn-primary flex-1 flex items-center justify-center gap-2 py-3">
                                        <Camera className="w-4 h-4" /> Snapshot
                                    </button>
                                    <button onClick={captureWithCapacitor} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex-1 flex items-center justify-center gap-2 py-3 font-bold transition-all">
                                        <Smartphone className="w-4 h-4" /> Direct Cam
                                    </button>
                                </div>
                                <button onClick={() => fileInputRef.current?.click()} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
                                    <Upload className="w-4 h-4" /> Mobile Capture
                                </button>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileUpload} 
                                    accept="image/*" 
                                    capture="user" 
                                    className="hidden" 
                                />
                            </div>
                        ) : (
                            <button onClick={retake} className="btn-secondary w-full flex items-center justify-center gap-2 py-3">
                                <RefreshCw className="w-4 h-4" /> Retake Photo
                            </button>
                        )}
                    </div>

                    {/* RIGHT SIDE: DATA */}
                    <div className="p-6 md:p-10 flex flex-col justify-center">
                        <div className="mb-6 md:mb-8">
                            <h2 className="text-xl md:text-2xl font-bold text-white mb-2">Register Identity</h2>
                            <p className="text-xs md:text-sm text-slate-500">Enter the subject's name and capture a biometric frame to establish building access.</p>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Subject Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                    className="input-field"
                                />
                            </div>

                            <button
                                onClick={handleRegister}
                                disabled={loading || !capturedImage || !name}
                                className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                            >
                                {loading ? "Authorizing..." : "Initialize Access"}
                                <ShieldCheck className="w-5 h-5" />
                            </button>

                            {status.message && (
                                <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${status.type === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                    }`}>
                                    {status.type === 'success' ? <ShieldCheck className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                    <span>{status.message}</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-10 flex items-center gap-6 opacity-30 grayscale active:grayscale-0 transition-all cursor-default">
                            <Lock className="w-5 h-5" />
                            <Shield className="w-5 h-5" />
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
