import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, ScanFace, Camera, MapPin } from 'lucide-react';
import { apiService } from '../services/api';
import BrandLogo from '../components/BrandLogo';

const YEAR = new Date().getFullYear();

const HIGHLIGHTS = [
    { icon: ScanFace, title: 'Face check-in at the door', text: 'Staff scan once; attendance and door unlock happen together.' },
    { icon: Camera, title: 'Photo evidence on every entry', text: 'Each check-in and check-out is stored with a stamped photo.' },
    { icon: MapPin, title: 'Time and place, recorded', text: 'Server time and terminal location on every record for clean timesheets.' },
];

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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
            console.error('Login error:', err);
            const status = err.response?.status;
            const msg = status === 401 || status === 403
                ? 'Email or password is incorrect.'
                : status === 429
                    ? 'Too many attempts. Please wait a few minutes and try again.'
                    : (err.response?.data?.message || 'Could not reach the server. Check your connection and try again.');
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-brand-slate flex flex-col lg:flex-row font-sans">
            {/* ── Brand panel ── */}
            <aside className="relative lg:w-[46%] xl:w-[44%] bg-brand-navy text-white flex flex-col justify-between overflow-hidden">
                {/* soft brand shapes */}
                <div className="pointer-events-none absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full bg-brand-navy-light/60 blur-3xl" aria-hidden="true" />
                <div className="pointer-events-none absolute -bottom-40 -left-24 w-[380px] h-[380px] rounded-full bg-brand-teal/20 blur-3xl" aria-hidden="true" />

                <div className="relative px-8 py-8 lg:px-14 lg:py-12">
                    <div className="inline-flex items-center gap-5 bg-white rounded-2xl pl-4 pr-6 py-3 shadow-lg shadow-brand-navy-deep/40">
                        <BrandLogo className="h-[72px] w-auto" />
                        <div className="hidden sm:block border-l border-slate-200 pl-5">
                            <div className="font-display font-bold text-brand-ink text-lg leading-tight">Attendance Tracker</div>
                            <div className="text-xs font-semibold text-slate-500 tracking-wide mt-0.5">Admin Console</div>
                        </div>
                    </div>
                </div>

                <div className="relative px-8 pb-10 lg:px-14 lg:pb-14 hidden lg:block">
                    <h2 className="font-display text-3xl xl:text-4xl font-bold text-white leading-tight max-w-md" style={{ textWrap: 'balance' }}>
                        Attendance you can stand behind.
                    </h2>
                    <p className="mt-3 text-brand-slate/80 max-w-md text-sm leading-relaxed">
                        Face-verified check-ins from the office terminal, with photo, time and location on every record.
                    </p>
                    <ul className="mt-8 space-y-4 max-w-md">
                        {HIGHLIGHTS.map((item) => (
                            <li key={item.title} className="flex items-start gap-3">
                                <span className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                                    <item.icon className="w-4 h-4 text-brand-teal" />
                                </span>
                                <div>
                                    <div className="text-sm font-semibold text-white">{item.title}</div>
                                    <div className="text-xs text-brand-slate/70 leading-relaxed">{item.text}</div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative px-8 pb-6 lg:px-14 lg:pb-8 text-[11px] text-brand-slate/60 hidden lg:block">
                    © {YEAR} Englabs · Attendance Tracker
                </div>
            </aside>

            {/* ── Sign-in panel ── */}
            <main className="flex-1 flex items-center justify-center px-6 py-10 lg:px-16">
                <div className="w-full max-w-[420px]">
                    <div className="mb-8">
                        <h1 className="font-display text-2xl md:text-[28px] font-bold text-brand-ink">Sign in</h1>
                        <p className="mt-1.5 text-sm text-slate-500">Use your administrator account to manage staff and attendance.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5" noValidate>
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="text-sm font-semibold text-slate-700">Email address</label>
                            <div className="relative">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                                <input
                                    id="email"
                                    type="email"
                                    autoComplete="username"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@englabs.in"
                                    className="input-field pl-10"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="input-field pl-10 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(s => !s)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-sm"
                        >
                            {loading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                            ) : (
                                <>Sign in <ArrowRight className="w-4 h-4" /></>
                            )}
                        </button>
                    </form>

                    <p className="mt-6 text-xs text-slate-500 leading-relaxed">
                        Access is limited to authorised Englabs administrators. Forgot your password? Contact the system owner to reset it.
                    </p>

                    <div className="mt-10 pt-6 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400 lg:hidden">
                        <span>© {YEAR} Englabs</span>
                        <span>Attendance Tracker</span>
                    </div>
                </div>
            </main>
        </div>
    );
}
