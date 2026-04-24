import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function CameraCaptureModal({ isOpen, onClose, onCapture, loading }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [capturedImage, setCapturedImage] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen]);

    const startCamera = async () => {
        setError(null);
        setCapturedImage(null);
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Camera access error:", err);
            setError("Could not access camera. Please ensure permissions are granted.");
        }
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

            // Draw frame
            context.drawImage(videoRef.current, 0, 0);

            // Convert to URL for local preview
            const previewUrl = canvasRef.current.toDataURL('image/jpeg', 0.9);
            setCapturedImage(previewUrl);

            // Convert to Blob for backend transmission
            canvasRef.current.toBlob((blob) => {
                canvasRef.current._lastBlob = blob;
                console.log("📸 Image captured as Blob:", blob.size, "bytes", blob.type);
            }, 'image/jpeg', 0.9);

            stopCamera();
        }
    };

    const handleConfirm = () => {
        if (canvasRef.current?._lastBlob) {
            console.log("🚀 Confirming capture, sending Blob to parent...");
            onCapture(canvasRef.current._lastBlob);
        } else {
            console.error("❌ No blob found for confirmation");
        }
    };

    const handleRetake = () => {
        setCapturedImage(null);
        startCamera();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                            <Camera className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">Face Registration</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8">
                    <div className="relative aspect-video bg-slate-950 rounded-3xl overflow-hidden border border-white/5 shadow-inner">
                        {error ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                                <p className="text-slate-300 font-medium">{error}</p>
                                <button onClick={startCamera} className="mt-4 text-blue-400 text-sm hover:underline">Try Again</button>
                            </div>
                        ) : capturedImage ? (
                            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover mirror"
                                style={{ transform: 'scaleX(-1)' }} // Mirror view
                            />
                        )}

                        {/* Scan Overlay Overlay */}
                        {!capturedImage && !error && (
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute inset-0 border-[40px] border-slate-950/40"></div>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 border-blue-500/30 rounded-[4rem] flex items-center justify-center">
                                    <div className="w-full h-1 bg-blue-500/50 absolute animate-scan-slow shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                                </div>
                            </div>
                        )}

                        {loading && (
                            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center">
                                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                                <p className="text-white font-bold tracking-widest uppercase text-xs">Processing Face...</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-8 flex justify-center gap-4">
                        {!capturedImage ? (
                            <button
                                onClick={capturePhoto}
                                disabled={!!error || !stream}
                                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                            >
                                <Camera className="w-5 h-5" /> Capture Photo
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleRetake}
                                    disabled={loading}
                                    className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 border border-white/5"
                                >
                                    <RefreshCw className="w-5 h-5" /> Retake
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={loading}
                                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold flex items-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                >
                                    <CheckCircle2 className="w-5 h-5" /> Confirm Image
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="px-8 py-6 bg-slate-950/50 border-t border-white/5">
                    <p className="text-center text-slate-500 text-xs uppercase tracking-[0.2em]">
                        Ensure your face is well-lit and centered in the frame
                    </p>
                </div>

                <canvas ref={canvasRef} className="hidden" />
            </motion.div>
        </div>
    );
}
