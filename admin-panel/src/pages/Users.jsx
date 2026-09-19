import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiService } from '../services/api';
import useAvatars from '../hooks/useAvatars';
import useProfilePhotos, { invalidateProfilePhoto } from '../hooks/useProfilePhotos';
import BrandLogo from '../components/BrandLogo';
import IdCard from '../components/IdCard';
import { TableSkeleton, EmptyState } from '../components/ui';
import BulkIdCards from '../components/BulkIdCards';
import {
    Search, Trash2, Edit2, UserPlus, X, Save,
    ScanFace, Fingerprint, AlertTriangle, UserX, UserCheck,
    Briefcase, CheckCircle2, Camera, RefreshCw, Loader2,
    ShieldCheck, AlertCircle, Upload, Smartphone,
    Mail, Calendar, CreditCard, Printer, BadgeCheck,
    ArrowUp, ArrowDown, ChevronsUpDown, Download, Eye, EyeOff
} from 'lucide-react';
import { Camera as CapCamera, CameraResultType, CameraSource } from '@capacitor/camera';

// Departments in use at Englabs (matches the live employees table). Keep in sync with the DB.
const DEPARTMENTS = [
    'Mechanical Engineering', 'Civil Engineering', 'Architecture', 'Computer Engineer IT', 'Workshop',
    'Paint', 'Sanding', 'Packing', 'Maintenance', 'House Keeping', 'Cleaning', 'Driver',
    'Accounts', 'Management', 'CEO', 'MD', 'General',
];
const EMPTY_FORM = {
    name: '', email: '', employee_id: '', department: 'Mechanical Engineering', company: 'Englabs India Pvt Ltd', role: 'employee',
    designation: '', joining_date: '', last_working_day: '', pan_number: '', aadhaar_number: '',
    date_of_birth: '', gender: '', blood_group: '', location: '', father_mother_name: '', spouse_name: '',
    contact_number: '', address: '', bank_name: '', bank_branch: '', bank_account_number: '', bank_ifsc: '',
    notify_email: false
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toasts, dismiss }) {
    return (
        <div className="fixed top-5 right-5 z-[200] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-bold
                        pointer-events-auto animate-in slide-in-from-right-8 duration-300
                        ${t.type === 'success'
                            ? 'bg-emerald-950 border-emerald-500/30 text-emerald-600'
                            : 'bg-red-950 border-red-500/30 text-red-600'}`}>
                    {t.type === 'success'
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                    <span>{t.message}</span>
                    <button onClick={() => dismiss(t.id)} className="ml-2 opacity-50 hover:opacity-100 transition-opacity">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            ))}
        </div>
    );
}

function useToast() {
    const [toasts, setToasts] = useState([]);
    const add = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    }, []);
    const dismiss = useCallback(id => setToasts(t => t.filter(x => x.id !== id)), []);
    return { toasts, add, dismiss };
}

// ── Modal Shell ───────────────────────────────────────────────────────────────
function Modal({ open, onClose, children, maxW = 'max-w-lg' }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <div className={`relative z-10 w-full ${maxW} bg-white border border-slate-200 rounded-xl shadow-2xl p-5 md:p-8 max-h-[90vh] overflow-y-auto`}
                onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteDialog({ user, onConfirm, onCancel }) {
    return (
        <Modal open={!!user} onClose={onCancel}>
            <div className="flex flex-col items-center text-center gap-5">
                <div className="w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Deactivate employee</h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        <span className="text-slate-900 font-bold">{user?.name}</span> will be hidden from all lists and can no longer
                        check in or unlock the door. Attendance history and photos are kept for records.
                    </p>
                </div>
                <div className="flex gap-3 w-full pt-2">
                    <button onClick={onCancel}
                        className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-300 text-sm font-bold transition-all">
                        Cancel
                    </button>
                    <button onClick={onConfirm}
                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all shadow-lg shadow-red-600/20">
                        Deactivate
                    </button>
                </div>
            </div>
        </Modal>
    );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function EmployeeModal({ mode, initialData, onSave, onClose, onEnrollFace, onEnrollFP, departments = DEPARTMENTS }) {
    const [form, setForm] = useState(initialData || EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [photoMsg, setPhotoMsg] = useState('');
    const photoInputRef = useRef(null);

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !initialData?.id) return;
        setUploadingPhoto(true); setPhotoMsg('');
        try {
            await apiService.uploadProfilePhoto(initialData.id, file);
            invalidateProfilePhoto(initialData.employee_id);
            setPhotoMsg('Photo uploaded — it now shows on the profile and ID card.');
        } catch (error) {
            setPhotoMsg(error.response?.data?.error || 'Upload failed. Try a JPEG or PNG under 2MB.');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleSubmit = async (e, enrollType = null) => {
        if (e) e.preventDefault();
        if (!form.name.trim() || !form.email.trim()) { setErr('Name and email are required.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(form.email.trim())) { setErr('Enter a valid email address, e.g. name@gmail.com'); return; }
        if (!String(form.employee_id || '').trim()) { setErr('Employee ID is required (e.g. EL107).'); return; }
        if (mode !== 'edit' && !/^(EL\d{3,4}|EMP-\d{3})$/i.test(String(form.employee_id).trim())) { setErr('Employee ID must look like EL107 (EL followed by 3 or 4 digits).'); return; }
        setSaving(true); setErr('');
        try { 
            const savedUser = await onSave(form); 
            if (!enrollType) onClose(); 
            if (enrollType === 'face' && onEnrollFace) { onClose(); onEnrollFace(savedUser || initialData); }
            if (enrollType === 'fp' && onEnrollFP) { onClose(); onEnrollFP(savedUser || initialData); }
        }
        catch (error) { setErr(error?.response?.data?.message || error.message || 'Save failed.'); }
        finally { setSaving(false); }
    };

    const field = (label, key, type = 'text', placeholder = '') => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500">{label}</label>
            <input type={type} value={form[key] || ''}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900
                           focus:outline-none focus:border-blue-500/40 transition-colors placeholder:text-slate-700" />
        </div>
    );

    return (
        <Modal open onClose={onClose}>
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900">{mode === 'add' ? 'Add Employee' : 'Edit Employee'}</h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={e => handleSubmit(e)} className="space-y-4">
                {field('Full Name', 'name', 'text', 'e.g. Rahul Sharma')}
                {field('Email', 'email', 'email', 'e.g. rahul@company.com')}
                {field('Employee ID', 'employee_id', 'text', 'e.g. EL107')}
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Department</label>
                    <input 
                        list="departments-list"
                        value={form.department || ''}
                        onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                        placeholder="Select or type department"
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900
                                   focus:outline-none focus:border-blue-500/40 transition-colors placeholder:text-slate-700" 
                    />
                    <datalist id="departments-list">
                        {departments.map(d => <option key={d} value={d} />)}
                    </datalist>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500">Company</label>
                    <input
                        list="companies-list"
                        value={form.company || ''}
                        onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        placeholder="Which Disha Arcade tenant — defaults to Englabs"
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900
                                   focus:outline-none focus:border-blue-500/40 transition-colors placeholder:text-slate-700"
                    />
                    <datalist id="companies-list">
                        <option value="Englabs India Pvt Ltd" />
                        <option value="A & A Architect" />
                        <option value="Sky5 Hotel" />
                        <option value="Bright Kids School" />
                    </datalist>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Designation', 'designation', 'text', 'e.g. Mechanical Engineer')}
                    {field('Joining Date', 'joining_date', 'date')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('PAN Number', 'pan_number', 'text', 'e.g. ABCDE1234F')}
                    {field('Aadhaar Number', 'aadhaar_number', 'text', 'e.g. 1234 5678 9012')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Date of Birth', 'date_of_birth', 'date')}
                    {field('Gender', 'gender', 'text', 'e.g. Male')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Blood Group', 'blood_group', 'text', 'e.g. A Positive')}
                    {field('Location', 'location', 'text', 'e.g. Panchkula')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Father / Mother Name', 'father_mother_name', 'text')}
                    {field('Spouse Name', 'spouse_name', 'text')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Contact Number', 'contact_number', 'text', 'e.g. 9876543210')}
                    {field('Address', 'address', 'text')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Bank Name', 'bank_name', 'text', 'e.g. IDFC FIRST Bank (India)')}
                    {field('Bank Branch', 'bank_branch', 'text')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field('Bank Account Number', 'bank_account_number', 'text')}
                    {field('Bank IFSC', 'bank_ifsc', 'text')}
                </div>
                {(mode === 'edit' && form.status === 'Disabled') && (
                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        {field('Last Working Day', 'last_working_day', 'date')}
                    </div>
                )}
                {err && <p className="text-xs font-bold text-red-600 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20">{err}</p>}
                
                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={onClose}
                        className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 text-sm font-bold transition-all">
                        Cancel
                    </button>
                    <button type="submit" disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : mode === 'add' ? 'Save Only' : 'Save Changes'}
                    </button>
                </div>

                <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="text-xs font-bold text-slate-500 block mb-3">Biometrics Setup</label>
                    <div className="flex gap-3">
                        <button type="button" onClick={(e) => handleSubmit(e, 'face')} disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-600 text-[13px] font-bold transition-all">
                            <ScanFace className="w-4 h-4" /> 
                            {mode === 'edit' && initialData?.face_registered ? 'Update Face' : 'Add Face'}
                        </button>
                        <button type="button" onClick={(e) => handleSubmit(e, 'fp')} disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 text-violet-600 text-[13px] font-bold transition-all">
                            <Fingerprint className="w-4 h-4" />
                            {mode === 'edit' && initialData?.fingerprint_registered ? 'Update Finger' : 'Add Finger'}
                        </button>
                    </div>
                </div>

                {mode === 'edit' && (
                    <div className="pt-4 mt-2 border-t border-slate-200">
                        <label className="flex items-start gap-3 mb-5 cursor-pointer">
                            <input type="checkbox" checked={form.notify_email === true}
                                onChange={e => setForm(f => ({ ...f, notify_email: e.target.checked }))}
                                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600" />
                            <span>
                                <span className="block text-sm font-semibold text-slate-900">Email updates</span>
                                <span className="block text-xs text-slate-500">Send this person an email when they are marked late, and when their leave is approved or rejected. Uses the email address above, so make sure it is a real one.</span>
                            </span>
                        </label>
                        <label className="text-xs font-bold text-slate-500 block mb-3">ID Card Photo</label>
                        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                            Upload a proper passport-style photo to use on the profile and printable ID card, instead of the
                            biometric scan capture.
                        </p>
                        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoUpload} />
                        <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 text-emerald-600 text-[13px] font-bold transition-all">
                            {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {uploadingPhoto ? 'Uploading…' : 'Upload Passport Photo'}
                        </button>
                        {photoMsg && <p className="text-xs text-slate-600 mt-2">{photoMsg}</p>}
                    </div>
                )}
            </form>
        </Modal>
    );
}

// ── Face Enrollment Modal ─────────────────────────────────────────────────────
function FaceEnrollModal({ user, onDone, onClose }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const [captured, setCaptured] = useState(null);
    const [loading, setLoading] = useState(false);
    const [camError, setCamError] = useState('');
    const [status, setStatus] = useState('');
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            setCaptured(event.target.result);
            stopCamera();
        };
        reader.readAsDataURL(file);
    };

    const startCamera = useCallback(async () => {
        setCamError('');
        try {
            const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            if (!navigator.mediaDevices?.getUserMedia && !isSecure) {
                setCamError('Camera requires HTTPS or Localhost.');
                return;
            }

            const s = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } 
            });
            streamRef.current = s;
            if (videoRef.current) videoRef.current.srcObject = s;
        } catch (err) {
            console.error("Camera Error:", err);
            setCamError('Browser camera blocked. Use "Direct Capture" / "Upload" below.');
        }
    }, []);

    const captureWithCapacitor = async () => {
        try {
            setLoading(true);
            const image = await CapCamera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Camera
            });
            setCaptured(image.dataUrl);
            stopCamera();
        } catch (err) {
            console.warn("Capacitor Camera cancelled or failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => { 
        // Using a slight delay to allow React 18 StrictMode unmount/remount to settle
        const timer = setTimeout(() => {
            if (!captured) startCamera();
        }, 100);
        return () => {
            clearTimeout(timer);
            stopCamera();
        };
    }, [startCamera, stopCamera, captured]);

    const capture = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);
        setCaptured(canvasRef.current.toDataURL('image/jpeg'));
        stopCamera();
    };

    const retake = () => { setCaptured(null); setStatus(''); }; // the effect on `captured` restarts the camera

    const enroll = async () => {
        if (!captured) return;
        setLoading(true); setStatus('');
        try {
            const res = await fetch(captured);
            const blob = await res.blob();
            const result = await apiService.registerFace(
                blob,
                user.employee_id || user.id,
                user.email,
                user.name,
                true   // re_enroll=true → bypass duplicate-ID guard for existing employees
            );
            if (result.success) {
                setStatus('success');
                // Refresh full user list to get updated join data
                setTimeout(() => { onDone(result.user || { ...user, face_registered: true }); onClose(); }, 1200);
            } else {
                throw new Error(result.message || 'Registration failed');
            }
        } catch (err) {
            setStatus('error:' + (err.response?.data?.message || err.message || 'Enrollment failed'));
        } finally {
            setLoading(false);
        }
    };

    const errMsg = status.startsWith('error:') ? status.slice(6) : '';

    return (
        <Modal open onClose={onClose} maxW="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <ScanFace className="w-5 h-5 text-blue-600" /> Enroll Face
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Enrolling biometric identity for <span className="text-slate-900 font-bold">{user.name}</span></p>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Camera */}
                <div className="space-y-3">
                    <div className="relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-slate-200">
                        {camError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
                                <AlertCircle className="w-10 h-10 text-red-600 opacity-50" />
                                <p className="text-xs text-slate-500">{camError}</p>
                            </div>
                        ) : captured ? (
                            <img src={captured} alt="Captured" className="w-full h-full object-cover" />
                        ) : (
                            <>
                                <video ref={videoRef} autoPlay playsInline muted
                                    className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
                                {/* Face guide overlay */}
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-40 h-52 rounded-full border-2 border-blue-400/40" />
                                </div>
                                <div className="absolute bottom-3 left-0 right-0 text-center text-xs font-bold text-slate-500">
                                    Position face in oval
                                </div>
                            </>
                        )}

                        {loading && (
                            <div className="absolute inset-0 bg-slate-100/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                <p className="text-xs text-slate-600 font-bold">Processing biometric…</p>
                            </div>
                        )}

                        {status === 'success' && (
                            <div className="absolute inset-0 bg-emerald-950/90 flex flex-col items-center justify-center gap-3">
                                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                                <p className="text-sm font-bold text-emerald-600">Face Enrolled!</p>
                            </div>
                        )}
                    </div>

                    {!captured ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                                <button onClick={capture} disabled={!!camError || loading}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[13px] font-bold rounded-xl transition-all">
                                    <Camera className="w-4 h-4" /> Snapshot
                                </button>
                                <button onClick={captureWithCapacitor} disabled={loading}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[13px] font-bold rounded-xl transition-all">
                                    <Smartphone className="w-4 h-4" /> Direct Cam
                                </button>
                            </div>
                            <button onClick={() => fileInputRef.current?.click()} disabled={loading}
                                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-[13px] font-bold rounded-xl transition-all border border-white/5">
                                <Upload className="w-4 h-4" /> Upload / Mobile Capture
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
                        <button onClick={retake} disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all">
                            <RefreshCw className="w-4 h-4" /> Retake
                        </button>
                    )}
                </div>

                {/* Info + Enroll */}
                <div className="flex flex-col justify-between">
                    <div className="space-y-4">
                        <InfoRow label="Employee" value={user.name} />
                        <InfoRow label="ID" value={user.employee_id || '—'} mono />
                        <InfoRow label="Email" value={user.email} mono />
                        <InfoRow label="Department" value={user.department || 'General'} />

                        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 text-xs text-slate-500 leading-relaxed">
                            Capture a clear, front-facing photo. The biometric engine will extract and store a secure face embedding. No raw image is stored.
                        </div>
                    </div>

                    <div className="space-y-3 mt-4">
                        {errMsg && (
                            <p className="text-xs font-bold text-red-600 bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errMsg}
                            </p>
                        )}
                        <button onClick={enroll} disabled={!captured || loading || status === 'success'}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            {loading ? 'Enrolling…' : 'Enroll Face'}
                        </button>
                    </div>
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
        </Modal>
    );
}

// ── Section heading with icon, used across the profile ───────────────────────
function SectionHeading({ icon: Icon, children }) {
    return (
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-3">
            <Icon className="w-3 h-3" /> {children}
        </div>
    );
}

// ── Staff Profile Modal ───────────────────────────────────────────────────────
function StaffProfileModal({ user, photoUrl, onClose, onEdit, onViewCard }) {
    if (!user) return null;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not added';
    return (
        <Modal open onClose={onClose} maxW="max-w-xl">
            {/* Cover banner + overlapping avatar */}
            <div className="-m-5 md:-m-8 mb-0 md:mb-0 relative">
                <div className="h-20 md:h-24 rounded-t-xl bg-gradient-to-r from-blue-100 via-indigo-50 to-white relative overflow-hidden">
                    <BrandLogo variant="mark" className="absolute -right-4 -top-4 w-28 h-28 opacity-[0.12]" />
                </div>
                <button onClick={onClose}
                    className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">
                    <X className="w-4 h-4" />
                </button>
                <div className="relative px-5 md:px-8 -mt-10 flex items-end gap-4 pb-5">
                    <div className="w-20 h-20 shrink-0 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 border-4 border-white flex items-center justify-center text-xl font-bold text-blue-700 overflow-hidden shadow-xl">
                        {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : (user.name || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-slate-900 truncate">{user.name}</h2>
                            <StatusBadge status={user.status || 'Active'} />
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{user.employee_id} · {user.designation || user.department || 'General'}</p>
                    </div>
                </div>
            </div>

            <div className="space-y-5 pt-1">
                <div>
                    <SectionHeading icon={Mail}>Identity</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Email" value={user.email || '—'} mono />
                        <InfoRow label="Role" value={user.role === 'admin' ? 'Admin' : 'Employee'} />
                        <InfoRow label="Status" value={user.status || 'Active'} />
                        <InfoRow label="Employee ID" value={user.employee_id} mono />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={Briefcase}>Employment</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Company" value={user.company || 'Englabs India Pvt Ltd'} />
                        <InfoRow label="Department" value={user.department || 'General'} />
                        <InfoRow label="Designation" value={user.designation || 'Not added'} />
                        <InfoRow label="Joining Date" value={fmtDate(user.joining_date)} />
                        <InfoRow label="Record Created" value={fmtDate(user.created_at)} />
                        {user.last_working_day && <InfoRow label="Last Working Day" value={fmtDate(user.last_working_day)} />}
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={UserCheck}>Personal</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Date of Birth" value={fmtDate(user.date_of_birth)} />
                        <InfoRow label="Gender" value={user.gender || 'Not added'} />
                        <InfoRow label="Blood Group" value={user.blood_group || 'Not added'} />
                        <InfoRow label="Location" value={user.location || 'Not added'} />
                        <InfoRow label="Father / Mother Name" value={user.father_mother_name || 'Not added'} />
                        <InfoRow label="Spouse Name" value={user.spouse_name || 'Not added'} />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={CreditCard}>Government ID</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <SensitiveRow label="PAN Number" value={user.pan_number} />
                        <SensitiveRow label="Aadhaar Number" value={user.aadhaar_number} />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={Mail}>Contact</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Contact Number" value={user.contact_number || 'Not added'} mono />
                        <InfoRow label="Address" value={user.address || 'Not added'} />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={CreditCard}>Bank Details</SectionHeading>
                    <div className="grid grid-cols-2 gap-4">
                        <InfoRow label="Bank Name" value={user.bank_name || 'Not added'} />
                        <InfoRow label="Branch" value={user.bank_branch || 'Not added'} />
                        <SensitiveRow label="Account Number" value={user.bank_account_number} />
                        <InfoRow label="IFSC" value={user.bank_ifsc || 'Not added'} mono />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
                    <SectionHeading icon={ScanFace}>Biometrics</SectionHeading>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${user.face_registered ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'}`}>
                            <ScanFace className="w-3 h-3" /> {user.face_registered ? 'Face Enrolled' : 'Face Not Enrolled'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${user.fingerprint_registered ? 'bg-violet-500/10 text-violet-600 border border-violet-500/20' : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'}`}>
                            <Fingerprint className="w-3 h-3" /> {user.fingerprint_registered ? 'Fingerprint Enrolled' : 'Fingerprint Not Enrolled'}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex gap-3 pt-6 mt-2">
                <button onClick={onClose}
                    className="py-3 px-4 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 text-sm font-bold transition-all">
                    Close
                </button>
                <button onClick={() => onViewCard(user)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 text-sm font-bold transition-all">
                    <BadgeCheck className="w-4 h-4" /> ID Card
                </button>
                <button onClick={() => onEdit(user)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20">
                    <Edit2 className="w-4 h-4" /> Edit Details
                </button>
            </div>
        </Modal>
    );
}

// ── ID Card ────────────────────────────────────────────────────────────────
function IdCardModal({ user, photoUrl, onClose }) {
    if (!user) return null;
    return (
        <Modal open onClose={onClose} maxW="max-w-sm">
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #englabs-id-card, #englabs-id-card * { visibility: visible; }
                    #englabs-id-card { position: fixed; inset: 0; margin: auto; }
                    @page { size: 3.375in 2.125in; margin: 0; }
                }
            `}</style>

            <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-slate-900">Employee ID Card</h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <IdCard id="englabs-id-card" user={user} photoUrl={photoUrl} />

            <div className="flex gap-3 pt-6">
                <button onClick={onClose}
                    className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 text-sm font-bold transition-all">
                    Close
                </button>
                <button onClick={() => window.print()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20">
                    <Printer className="w-4 h-4" /> Print Card
                </button>
            </div>
        </Modal>
    );
}

function InfoRow({ label, value, mono = false }) {
    return (
        <div>
            <div className="text-xs font-semibold text-slate-600 mb-0.5">{label}</div>
            <div className={`text-sm font-semibold text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    );
}

// Sensitive identifiers (Aadhaar, PAN, bank account) stay masked until someone chooses to reveal them.
function maskValue(v) {
    const chars = [...String(v)];
    let seen = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
        if (/[A-Za-z0-9]/.test(chars[i])) { if (seen >= 4) chars[i] = '•'; seen++; }
    }
    return chars.join('');
}

function SensitiveRow({ label, value }) {
    const [shown, setShown] = useState(false);
    if (!value) return <InfoRow label={label} value="Not added" mono />;
    return (
        <div>
            <div className="text-xs font-semibold text-slate-600 mb-0.5">{label}</div>
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 font-mono">{shown ? value : maskValue(value)}</span>
                <button type="button" onClick={() => setShown(v => !v)}
                    aria-label={shown ? `Hide ${label}` : `Show ${label}`} title={shown ? 'Hide' : 'Show'}
                    className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100">
                    {shown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
            </div>
        </div>
    );
}

// ── Fingerprint Enrollment Modal ──────────────────────────────────────────────
function FingerprintEnrollModal({ user, onDone, onClose }) {
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState('');

    const enroll = async () => {
        setLoading(true); setErr('');
        try {
            // Admin web panel can't trigger device biometrics — mark as enrolled manually
            // In production the terminal/hardware device handles actual fingerprint capture
            await apiService.updateUser(user.id, { fingerprint_registered: true });
            setDone(true);
            setTimeout(() => { onDone({ ...user, fingerprint_registered: true }); onClose(); }, 1200);
        } catch (err) {
            setErr(err.response?.data?.message || err.message || 'Enrollment failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open onClose={onClose}>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Fingerprint className="w-5 h-5 text-violet-600" /> Enroll Fingerprint
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Biometric enrollment for <span className="text-slate-900 font-bold">{user.name}</span></p>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-900 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex flex-col items-center gap-6 py-4">
                {/* Animated fingerprint icon */}
                <div className={`relative w-28 h-28 rounded-full flex items-center justify-center border-2 transition-all
                    ${done ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-violet-500/10 border-violet-500/30'}`}>
                    {done ? (
                        <CheckCircle2 className="w-14 h-14 text-emerald-600" />
                    ) : (
                        <>
                            <Fingerprint className={`w-14 h-14 text-violet-600 ${loading ? 'animate-pulse' : ''}`} />
                            {loading && (
                                <div className="absolute inset-0 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                            )}
                        </>
                    )}
                </div>

                <div className="text-center space-y-1">
                    {done ? (
                        <>
                            <p className="text-lg font-bold text-emerald-600">Fingerprint Enrolled!</p>
                            <p className="text-xs text-slate-500">Record updated successfully.</p>
                        </>
                    ) : (
                        <>
                            <p className="text-base font-bold text-slate-900">Confirm Fingerprint Enrollment</p>
                            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                                This will mark <span className="text-slate-900">{user.name}</span>'s fingerprint as registered.
                                The actual fingerprint capture happens at the physical terminal device.
                            </p>
                        </>
                    )}
                </div>

                {err && (
                    <p className="text-xs font-bold text-red-600 bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20 flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {err}
                    </p>
                )}

                {!done && (
                    <div className="flex gap-3 w-full">
                        <button onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 hover:text-slate-900 text-sm font-bold transition-all">
                            Cancel
                        </button>
                        <button onClick={enroll} disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-slate-900 text-sm font-bold transition-all shadow-lg shadow-violet-600/20">
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                            {loading ? 'Enrolling…' : 'Confirm Enroll'}
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

// ── Biometrics Cell Component ─────────────────────────────────────────────────
function BiometricsCell({ user, onEnrollFace, onEnrollFP }) {
    return (
        <div className="flex items-center gap-1.5 flex-wrap">
            {/* Face Status */}
            <div className="flex items-center">
                {user.face_registered ? (
                    <div className="flex items-center bg-emerald-500/10 border border-emerald-500/20 rounded-full overflow-hidden">
                        <span className="px-2.5 py-1 text-xs font-bold text-emerald-600 flex items-center gap-1">
                            <ScanFace className="w-3 h-3" /> Face ✓
                        </span>
                        <button onClick={() => onEnrollFace(user)} title="Update Face Biometric"
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-xs font-bold text-emerald-600 border-l border-emerald-500/20 transition-all">
                            Update
                        </button>
                    </div>
                ) : (
                    <button onClick={() => onEnrollFace(user)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-bold text-blue-600 hover:bg-blue-500/20 transition-all">
                        <ScanFace className="w-3 h-3" /> Enroll Face
                    </button>
                )}
            </div>

            {/* Fingerprint Status */}
            <div className="flex items-center">
                {user.fingerprint_registered ? (
                    <div className="flex items-center bg-violet-500/10 border border-violet-500/20 rounded-full overflow-hidden">
                        <span className="px-2.5 py-1 text-xs font-bold text-violet-600 flex items-center gap-1">
                            <Fingerprint className="w-3 h-3" /> Finger ✓
                        </span>
                        <button onClick={() => onEnrollFP(user)} title="Update Fingerprint"
                            className="px-2 py-1 bg-violet-500/20 hover:bg-violet-500/30 text-xs font-bold text-violet-600 border-l border-violet-500/20 transition-all">
                            Update
                        </button>
                    </div>
                ) : (
                    <button onClick={() => onEnrollFP(user)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-600 hover:bg-slate-500/20 transition-all">
                        <Fingerprint className="w-3 h-3" /> Enroll FP
                    </button>
                )}
            </div>
        </div>
    );
}

function StatusBadge({ status }) {
    const cfg = {
        Active: { dot: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20' },
        Disabled: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-500/10 border-amber-500/20' },
        Deleted: { dot: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-500/10 border-red-500/20' },
    };
    const c = cfg[status] || cfg.Active;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} /> {status || 'Active'}
        </span>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Users() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [companyFilter, setCompanyFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [sort, setSort] = useState({ key: null, dir: 'asc' });
    const [selected, setSelected] = useState(() => new Set());
    const [bulkPrint, setBulkPrint] = useState(false);

    // Modals
    const [addOpen, setAddOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [faceTarget, setFaceTarget] = useState(null);   // user for face enrollment
    const [fpTarget, setFpTarget] = useState(null);   // user for fingerprint enrollment
    const [profileTarget, setProfileTarget] = useState(null);   // user for the full profile view
    const [cardTarget, setCardTarget] = useState(null);   // user for the printable ID card
    const [actionLoading, setActionLoading] = useState(null);

    const { toasts, add: addToast, dismiss } = useToast();

    // Departments actually in use (from the API) merged with the known list, so anything
    // typed in the dashboard shows up as a suggestion next time.
    const [liveDepartments, setLiveDepartments] = useState([]);
    useEffect(() => {
        apiService.getDepartments().then(d => setLiveDepartments(Array.isArray(d) ? d : [])).catch(() => {});
    }, []);
    const allDepartments = [...new Set([...DEPARTMENTS, ...liveDepartments.filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const KNOWN_COMPANIES = ['Englabs India Pvt Ltd', 'A & A Architect', 'Sky5 Hotel', 'Bright Kids School'];
    const allCompanies = [...new Set([...KNOWN_COMPANIES, ...users.map(u => u.company).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const departmentsInUse = [...new Set(users.map(u => u.department).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setLoading(true); setError(null);
        try {
            const data = await apiService.getUsers();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to connect.');
        } finally { setLoading(false); }
    };

    // Latest-scan face crops for the whole list (one request, cached 50 min)
    const avatars = useAvatars(users.map(u => u.employee_id));
    const profilePhotos = useProfilePhotos(users.map(u => u.employee_id));

    const patchUser = (updated) =>
        setUsers(u => u.map(x => x.id === updated.id ? { ...x, ...updated } : x));

    const filtered = users
        .filter(u =>
            (u.name?.toLowerCase().includes(search.toLowerCase()) ||
                u.employee_id?.toLowerCase().includes(search.toLowerCase()) ||
                u.email?.toLowerCase().includes(search.toLowerCase())) &&
            (!companyFilter || (u.company || 'Englabs India Pvt Ltd') === companyFilter) &&
            (!departmentFilter || u.department === departmentFilter)
        )
        // Resigned/disabled staff sink to the bottom, so the list reads as "who's here now" first.
        .sort((a, b) => {
            const disabled = (a.status === 'Disabled') - (b.status === 'Disabled');
            if (disabled || !sort.key) return disabled;
            const val = (u) => String(u[sort.key] ?? '').toLowerCase();
            const cmp = val(a).localeCompare(val(b), undefined, { numeric: true });
            return sort.dir === 'asc' ? cmp : -cmp;
        });

    const selectedUsers = filtered.filter(u => selected.has(u.id));
    const allShownSelected = filtered.length > 0 && selectedUsers.length === filtered.length;
    const toggleOne = (id) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(filtered.map(u => u.id)));

    const toggleSort = (key) =>
        setSort(cur => cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

    const exportCsv = (list = filtered) => {
        const cols = [
            ['Sr. No.', (u, i) => i + 1], ['Employee ID', u => u.employee_id], ['Name', u => u.name],
            ['Company', u => u.company || 'Englabs India Pvt Ltd'], ['Department', u => u.department],
            ['Designation', u => u.designation], ['Status', u => u.status || 'Active'],
            ['Joining Date', u => u.joining_date], ['Contact', u => u.contact_number],
        ];
        const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const csv = [cols.map(c => esc(c[0])).join(','), ...list.map((u, i) => cols.map(c => esc(c[1](u, i))).join(','))].join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = list === filtered ? 'employees.csv' : 'employees-selected.csv'; a.click();
        URL.revokeObjectURL(url);
    };

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleAdd = async (form) => {
        const created = await apiService.createEmployee(form);
        setUsers(u => [created, ...u]);
        addToast(`Employee "${form.name}" added.`);
        return created;
    };

    const handleEdit = async (form) => {
        // Optimization: Only send fields that actually changed
        const updates = {};
        Object.keys(form).forEach(key => {
            if (form[key] !== editTarget[key]) {
                updates[key] = form[key];
            }
        });

        if (Object.keys(updates).length === 0) {
            addToast('No changes detected.');
            // Only close edit modal if we aren't immediately transferring to enroll modal
            // (the modal handles its own close, but just in case)
            // returning editTarget helps biometric button know who to enroll
            return editTarget;
        }

        try {
            console.log(`📡 Sending updates for ${editTarget.id}:`, updates);
            const updated = await apiService.updateUser(editTarget.id, updates);
            patchUser(updated);
            addToast('Employee details updated.');
            return updated;
        } catch (error) {
            const msg = error.response?.data?.message || error.response?.data?.error || error.message;
            addToast(`Update failed: ${msg}`, 'error');
            throw error; // Let the modal handle the error display
        }
    };

    const handleDisableToggle = async (user) => {
        setActionLoading(user.id);
        try {
            const isDisabled = user.status === 'Disabled';
            const updated = isDisabled
                ? await apiService.enableUser(user.id)
                : await apiService.disableUser(user.id);
            patchUser(updated);
            addToast(`${user.name} ${isDisabled ? 'enabled' : 'disabled'}.`);
        } catch (err) {
            addToast(err.response?.data?.message || err.message, 'error');
        } finally { setActionLoading(null); }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setDeleteTarget(null); setActionLoading(target.id);
        try {
            await apiService.deleteUser(target.id);
            setUsers(u => u.filter(x => x.id !== target.id));
            addToast(`${target.name} deleted.`);
        } catch (err) {
            addToast(err.response?.data?.message || err.message, 'error');
        } finally { setActionLoading(null); }
    };

    // Biometric enrollment callbacks
    const handleFaceEnrolled = (updated) => {
        patchUser(updated);
        addToast(`Face enrolled successfully for ${updated.name} ✓`);
    };

    const handleFPEnrolled = (updated) => {
        patchUser(updated);
        addToast(`Fingerprint enrolled successfully for ${updated.name} ✓`);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Toasts */}
            <Toast toasts={toasts} dismiss={dismiss} />

            {/* Modals */}
            {addOpen && <EmployeeModal departments={allDepartments} mode="add" onSave={handleAdd} onClose={() => setAddOpen(false)} onEnrollFace={setFaceTarget} onEnrollFP={setFpTarget} />}
            {editTarget && <EmployeeModal departments={allDepartments} mode="edit" initialData={editTarget} onSave={handleEdit} onClose={() => setEditTarget(null)} onEnrollFace={setFaceTarget} onEnrollFP={setFpTarget} />}
            {faceTarget && <FaceEnrollModal user={faceTarget} onDone={handleFaceEnrolled} onClose={() => setFaceTarget(null)} />}
            {fpTarget && <FingerprintEnrollModal user={fpTarget} onDone={handleFPEnrolled} onClose={() => setFpTarget(null)} />}
            {profileTarget && <StaffProfileModal user={profileTarget} photoUrl={profilePhotos[profileTarget.employee_id] || avatars[profileTarget.employee_id] || profileTarget.image_url} onClose={() => setProfileTarget(null)}
                onEdit={(u) => { setProfileTarget(null); setEditTarget(u); }}
                onViewCard={(u) => { setProfileTarget(null); setCardTarget(u); }} />}
            {cardTarget && <IdCardModal user={cardTarget} photoUrl={profilePhotos[cardTarget.employee_id] || avatars[cardTarget.employee_id] || cardTarget.image_url} onClose={() => setCardTarget(null)} />}
            {bulkPrint && <BulkIdCards users={selectedUsers} photoFor={(u) => profilePhotos[u.employee_id] || avatars[u.employee_id] || u.image_url} onClose={() => setBulkPrint(false)} />}
            <DeleteDialog user={deleteTarget} onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} />

            {/* ── Header ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1 tracking-tight">Personnel Management</h1>
                    <p className="text-slate-500 text-sm">
                        {users.length} people &middot; biometric access control
                    </p>
                </div>
                <button onClick={() => setAddOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
                    <UserPlus className="w-4 h-4" /> Add Employee
                </button>
            </div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total people', value: users.length },
                    { label: 'Active', value: users.filter(u => u.status === 'Active' || !u.status).length },
                    { label: 'Face enrolled', value: users.filter(u => u.face_embedding || u.face_registered).length },
                    { label: 'Fingerprint enrolled', value: users.filter(u => u.fingerprint_registered).length },
                ].map(s => (
                    <div key={s.label} className="p-4 sm:p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
                        <div className="text-xs font-semibold text-slate-500 mb-1.5">{s.label}</div>
                        <div className="text-2xl sm:text-3xl font-bold tabular-nums text-slate-900 leading-none">{loading ? '—' : s.value}</div>
                    </div>
                ))}
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                {/* Search + Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[180px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search name, email or ID..."
                            className="w-full bg-white border border-slate-200 shadow-sm rounded-xl pl-9 pr-4 py-2 text-sm text-slate-900
                                       focus:outline-none focus:border-blue-500/30 placeholder:text-slate-700" />
                    </div>
                    <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
                        className="bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 text-sm text-slate-900
                                   focus:outline-none focus:border-blue-500/30">
                        <option value="">All Companies</option>
                        {allCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}
                        className="bg-white border border-slate-200 shadow-sm rounded-xl px-3 py-2 text-sm text-slate-900
                                   focus:outline-none focus:border-blue-500/30">
                        <option value="">All Departments</option>
                        {departmentsInUse.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    {(companyFilter || departmentFilter) && (
                        <button onClick={() => { setCompanyFilter(''); setDepartmentFilter(''); }}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700">
                            Reset
                        </button>
                    )}
                    <span className="text-sm text-slate-500 ml-auto tabular-nums">
                        {filtered.length} results
                    </span>
                    <button onClick={exportCsv} disabled={filtered.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors">
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                </div>

                {selectedUsers.length > 0 && (
                    <div className="px-4 md:px-6 py-3 border-b border-blue-200 bg-blue-50 flex items-center gap-3 flex-wrap" role="region" aria-label="Bulk actions">
                        <span className="text-sm font-semibold text-blue-900">{selectedUsers.length} selected</span>
                        <button onClick={() => setBulkPrint(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm">
                            <Printer className="w-4 h-4" /> Print ID cards
                        </button>
                        <button onClick={() => exportCsv(selectedUsers)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">
                            <Download className="w-4 h-4" /> Export selected
                        </button>
                        <button onClick={() => setSelected(new Set())} className="ml-auto text-sm font-medium text-blue-700 hover:text-blue-900">Clear selection</button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                                <th className="pl-4 md:pl-6 pr-0 py-3 w-8 sticky top-0 bg-slate-50 z-10"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown employees" className="w-4 h-4 rounded border-slate-300 text-blue-600" /></th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 hidden md:table-cell w-16">Sr. No.</th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 hidden sm:table-cell" aria-sort={sort.key === 'employee_id' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button onClick={() => toggleSort('employee_id')} className="inline-flex items-center gap-1 hover:text-slate-900">
                                        Employee ID
                                        {sort.key === 'employee_id' ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-600" />}
                                    </button>
                                </th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button onClick={() => toggleSort('name')} className="inline-flex items-center gap-1 hover:text-slate-900">
                                        Employee
                                        {sort.key === 'name' ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-600" />}
                                    </button>
                                </th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 hidden md:table-cell" aria-sort={sort.key === 'department' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button onClick={() => toggleSort('department')} className="inline-flex items-center gap-1 hover:text-slate-900">
                                        Department
                                        {sort.key === 'department' ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-600" />}
                                    </button>
                                </th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10" aria-sort={sort.key === 'status' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-slate-900">
                                        Status
                                        {sort.key === 'status' ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-600" />}
                                    </button>
                                </th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 hidden lg:table-cell">Biometrics</th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 hidden xl:table-cell" aria-sort={sort.key === 'joining_date' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                    <button onClick={() => toggleSort('joining_date')} className="inline-flex items-center gap-1 hover:text-slate-900">
                                        Joined
                                        {sort.key === 'joining_date' ? (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 text-slate-600" />}
                                    </button>
                                </th>
                                <th className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600 sticky top-0 bg-slate-50 z-10 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {loading ? (
                                <TableSkeleton rows={6} cols={9} bare />
                            ) : error ? (
                                <tr><td colSpan={9}><EmptyState icon={AlertCircle} title="Could not load employees" hint={error} action={<button onClick={fetchUsers} className="mt-2 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Try again</button>} /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={9}><EmptyState icon={Search} title="No employees found" hint={search || companyFilter || departmentFilter ? 'Nothing matches these filters. Try clearing them.' : 'Add your first employee to get started.'} /></td></tr>
                            ) : filtered.map((user, idx) => {
                                const isActioning = actionLoading === user.id;
                                const isDisabled = user.status === 'Disabled';
                                const initials = (user.name || '?').slice(0, 2).toUpperCase();
                                const createdAt = user.created_at
                                    ? new Date(user.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : '—';
                                const joinedAt = user.joining_date
                                    ? new Date(user.joining_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                    : null;
                                return (
                                    <tr key={user.id}
                                        className={`group transition-colors ${isDisabled ? 'opacity-50' : 'hover:bg-slate-50'}`}>

                                        <td className="pl-4 md:pl-6 pr-0 py-3 w-8"><input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleOne(user.id)} aria-label={`Select ${user.name}`} className="w-4 h-4 rounded border-slate-300 text-blue-600" /></td>
                                        <td className="hidden md:table-cell px-4 md:px-6 py-3 text-sm text-slate-500 tabular-nums">{idx + 1}</td>
                                        <td className="hidden sm:table-cell px-4 md:px-6 py-3 text-sm font-mono text-slate-700">{user.employee_id || '—'}</td>

                                        {/* Employee */}
                                        <td className="px-4 md:px-6 py-3">
                                            <button onClick={() => setProfileTarget(user)} title="View full profile"
                                                className="flex items-center gap-3 text-left group/row">
                                                <div className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border border-blue-500/20 flex items-center justify-center text-xs md:text-xs font-bold text-emerald-600 overflow-hidden">
                                                    {(profilePhotos[user.employee_id] || avatars[user.employee_id] || user.image_url)
                                                        ? <img src={profilePhotos[user.employee_id] || avatars[user.employee_id] || user.image_url} alt="" className="w-full h-full object-cover" />
                                                        : initials}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-slate-900 truncate group-hover/row:text-blue-600 transition-colors">{user.name}</div>
                                                    <div className="text-xs text-slate-500 truncate sm:hidden">{user.employee_id || user.email}</div>
                                                </div>
                                            </button>
                                        </td>
                                        
                                        {/* Department */}
                                        <td className="hidden md:table-cell px-4 md:px-6 py-3">
                                            {user.company && user.company !== 'Englabs India Pvt Ltd' && (
                                                <div className="text-xs font-semibold text-amber-700 mb-0.5">{user.company}</div>
                                            )}
                                            <div className="flex items-center gap-1.5 text-sm text-slate-700">
                                                <Briefcase className="w-3 h-3 text-slate-600" />
                                                {user.department || 'General'}
                                            </div>
                                            {user.designation && (
                                                <div className="text-xs text-slate-500 mt-0.5 truncate">{user.designation}</div>
                                            )}
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 md:px-6 py-3">
                                            <StatusBadge status={user.status || 'Active'} />
                                        </td>

                                        {/* Biometrics */}
                                        <td className="hidden lg:table-cell px-4 md:px-6 py-3">
                                            <BiometricsCell
                                                user={user}
                                                onEnrollFace={u => setFaceTarget(u)}
                                                onEnrollFP={u => setFpTarget(u)}
                                            />
                                        </td>

                                        {/* Created */}
                                        <td className="hidden xl:table-cell px-4 md:px-6 py-3">
                                            <span className="text-sm text-slate-700 tabular-nums">{joinedAt || '—'}</span>
                                            <div className="text-xs text-slate-500 tabular-nums mt-0.5">Added {createdAt}</div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 md:px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-0.5 md:gap-1">
                                                <button onClick={() => setCardTarget(user)} title="Print ID Card"
                                                    className="p-1.5 md:p-2 rounded-lg hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-600 transition-all">
                                                    <CreditCard className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                </button>
                                                <button onClick={() => setEditTarget(user)} title="Edit"
                                                    className="p-1.5 md:p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-emerald-600 transition-all">
                                                    <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                </button>
                                                <button onClick={() => handleDisableToggle(user)} disabled={isActioning}
                                                    title={isDisabled ? 'Enable' : 'Disable'}
                                                    className={`p-1.5 md:p-2 rounded-lg transition-all ${isDisabled
                                                        ? 'hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-600'
                                                        : 'hover:bg-amber-500/10  text-slate-500 hover:text-amber-700'}`}>
                                                    {isDisabled ? <UserCheck className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <UserX className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                                                </button>
                                                <button onClick={() => setDeleteTarget(user)} disabled={isActioning} title="Delete"
                                                    className="p-1.5 md:p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-600 transition-all">
                                                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
