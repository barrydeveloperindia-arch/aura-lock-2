
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../store/AuthContext';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/admin');
        } catch (err) {
            setError(err.message || 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full mix-blend-screen animate-pulse"></div>
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full mix-blend-screen"></div>

            <div className="relative z-10 w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-cyan-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wide">Admin Access</h1>
                    <p className="text-slate-400 text-sm mt-1">Secure Control Panel</p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3 text-red-400 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Email Address</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="email"
                                required
                                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-600"
                                placeholder="admin@securecorp.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Password</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-3.5 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="password"
                                required
                                className="w-full bg-slate-950/50 border border-slate-700/50 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:bg-slate-900 transition-all placeholder:text-slate-600"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-500/20 transform transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                    >
                        {loading ? 'Verifying...' : 'Sign In'}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-xs">
                        Restricted Access &bull; Authorization Required
                    </p>
                </div>
            </div>
        </div>
    );
}
