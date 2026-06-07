import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Shield, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await apiService.login(email, password);
            navigate('/admin/dashboard');
        } catch (err) {
            console.error('❌ Login error:', err);
            const msg = err.response?.data?.message || err.message || 'Authentication failed';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 relative overflow-hidden font-sans">
            {/* Background Accents */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full -mr-64 -mt-64"></div>
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-teal-500/10 blur-[120px] rounded-full -ml-64 -mb-64"></div>

            <div className="w-full max-w-md relative z-10">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center shadow-lg shadow-emerald-500/10 mx-auto mb-6">
                        <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M50 10C27.9 10 10 27.9 10 50C10 72.1 27.9 90 50 90C72.1 90 90 72.1 90 50" stroke="currentColor" strokeWidth="12" strokeLinecap="round"/>
                            <path d="M30 50C30 39 39 30 50 30C61 30 70 39 70 50C70 61 61 70 50 70" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
                            <circle cx="50" cy="50" r="10" fill="currentColor"/>
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">EngLabs</h1>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Attendance System Administration</p>
                </div>

                {/* Login Card */}
                <div className="card shadow-2xl !p-10">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Identity Email</label>
                            <div className="relative group/input">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-emerald-500 transition-colors" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@englabs.com"
                                    className="input-field pl-12"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Access Token</label>
                            <div className="relative group/input">
                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within/input:text-emerald-500 transition-colors" />
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="input-field pl-12"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-1">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-3 py-4 shadow-xl shadow-emerald-500/20 text-sm uppercase tracking-widest font-black"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Verifying Node...</span>
                                </>
                            ) : (
                                <>
                                    <span>Establish Link</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center text-slate-400 text-[9px] font-black uppercase tracking-[0.4em]">
                    Authorized Personnel Only // Node 0x88F
                </div>
            </div>
        </div>
    );
}
