
import React, { useState, useEffect } from 'react';
import { Plus, Search, MoreVertical, ScanFace, Fingerprint, Scan, User, Trash2, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';
import { apiService } from '../../services/api.service';
import CameraCaptureModal from '../../components/CameraCaptureModal';

export default function UsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showCamera, setShowCamera] = useState(false);
    const [error, setError] = useState(null);
    const [biometricLoading, setBiometricLoading] = useState(false);

    const [newUser, setNewUser] = useState({
        name: '',
        employeeId: '',
        email: '',
        role: 'user',
        accessLevel: 1,
        faceEncoding: [],
        fingerprintId: null
    });

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await apiService.getUsers();
            setUsers(data);
        } catch (err) {
            setError("Failed to load users");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleFaceCapture = async (imageData) => {
        setBiometricLoading(true);
        setError(null);
        try {
            console.log("🧬 Starting face registration...");
            const response = await apiService.registerFace(imageData, newUser.employeeId, newUser.email);

            if (response.success) {
                console.log("✅ Face registered successfully:", response);
                setNewUser(prev => ({
                    ...prev,
                    faceEncoding: response.encoding || [],
                    image_url: response.image_url
                }));
                setShowCamera(false);
                // Optional: Show a success toast if you have one
            } else {
                console.warn("⚠️ Face registration rejected:", response.message);
                setError(response.message || "Face not recognized. Please try again.");
            }
        } catch (err) {
            console.error("❌ Face registration network/server error:", err);
            const errorMsg = err.message || (typeof err === 'string' ? err : "Server unreachable. Ensure Biometric API (Port 8001) is running.");
            setError(errorMsg);
            alert(`Face registration error: ${errorMsg}`);
        } finally {
            setBiometricLoading(false);
        }
    };

    const handleFingerprintEnroll = async () => {
        setBiometricLoading(true);
        try {
            const response = await apiService.enrollFingerprint();
            setNewUser(prev => ({ ...prev, fingerprintId: response.fingerprintId }));
        } catch (err) {
            console.error("Fingerprint enrollment failed:", err);
            alert("Fingerprint enrollment failed. Please try again.");
        } finally {
            setBiometricLoading(false);
        }
    };

    const handleDeleteUser = async (id) => {
        if (!window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) return;

        try {
            await apiService.deleteUser(id);
            loadUsers();
        } catch (err) {
            alert(err.message || "Failed to delete user");
        }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        setError(null);

        // Validation: Ensure at least one biometric
        if (newUser.faceEncoding.length === 0 && !newUser.fingerprintId) {
            setError("At least one biometric (Face or Fingerprint) is required.");
            return;
        }

        try {
            await apiService.createUser({ ...newUser, status: 'active' });
            setShowModal(false);
            resetForm();
            loadUsers();
        } catch (err) {
            setError(err.message || "Failed to create user");
        }
    };

    const resetForm = () => {
        setNewUser({
            name: '',
            employeeId: '',
            email: '',
            role: 'user',
            accessLevel: 1,
            faceEncoding: [],
            fingerprintId: null
        });
        setError(null);
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-white">User Management</h1>
                <button
                    onClick={() => { resetForm(); setShowModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl transition-all font-bold shadow-lg shadow-blue-500/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    Add New User
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/50 text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-800">
                        <tr>
                            <th className="p-6">Employee</th>
                            <th className="p-6">Role</th>
                            <th className="p-6">Biometrics</th>
                            <th className="p-6">Status</th>
                            <th className="p-6 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <tr key={i} className="animate-pulse h-20">
                                    <td colSpan="5" className="px-6 bg-slate-800/10"></td>
                                </tr>
                            ))
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-12 text-center text-slate-500 font-medium">No users found. Start by adding one.</td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user._id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="p-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white font-bold border border-white/5 group-hover:border-blue-500/30 transition-all overflow-hidden">
                                                {user.image_url ? (
                                                    <img src={user.image_url} alt={user.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    user.name.charAt(0)
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-bold text-white mb-0.5">{user.name}</div>
                                                <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">#{user.employeeId}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-slate-800 text-slate-400 border border-white/5'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        <div className="flex gap-2">
                                            <div title="Face ID" className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${user.faceEncoding?.length > 0 ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-slate-950/50 text-slate-700 border-slate-800'}`}>
                                                <ScanFace className="w-4 h-4" />
                                            </div>
                                            <div title="Fingerprint" className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${user.fingerprintId ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-950/50 text-slate-700 border-slate-800'}`}>
                                                <Fingerprint className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <span className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${user.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                                            {user.status}
                                        </span>
                                    </td>
                                    <td className="p-6 text-right">
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="p-3 hover:bg-red-500/10 rounded-xl text-slate-500 hover:text-red-400 transition-all active:scale-90"
                                            title="Delete User"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add User Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] w-full max-w-xl overflow-hidden shadow-2xl">
                        <div className="p-8 border-b border-white/5 flex justify-between items-center">
                            <h2 className="text-2xl font-black text-white tracking-tight">Add New Employee</h2>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                                <X className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleAddUser} className="p-8">
                            {error && (
                                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm">
                                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-1">Employee ID</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="EMP-1234"
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                                            value={newUser.employeeId}
                                            onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value.toUpperCase() })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-1">Full Name</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="John Doe"
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                                            value={newUser.name}
                                            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-1">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        placeholder="john@company.com"
                                        className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-700"
                                        value={newUser.email}
                                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-1">Role</label>
                                        <select
                                            className="w-full bg-slate-950 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-blue-500 transition-all appearance-none"
                                            value={newUser.role}
                                            onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                        >
                                            <option value="user">Standard User</option>
                                            <option value="admin">System Admin</option>
                                            <option value="security">Security Officer</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest ml-1">Access Level (1-5)</label>
                                        <div className="flex items-center gap-4 bg-slate-950 border border-white/5 rounded-2xl px-5 py-1.5">
                                            <input
                                                type="range"
                                                min="1" max="5"
                                                className="flex-1 accent-blue-500"
                                                value={newUser.accessLevel}
                                                onChange={(e) => setNewUser({ ...newUser, accessLevel: parseInt(e.target.value) })}
                                            />
                                            <span className="text-white font-bold w-4">{newUser.accessLevel}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-slate-950 rounded-[2rem] border border-white/5 space-y-4">
                                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest text-center mb-2">Biometric Enrollment</p>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowCamera(true)}
                                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${newUser.faceEncoding.length > 0 ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800'}`}
                                        >
                                            {newUser.faceEncoding.length > 0 ? <CheckCircle2 className="w-6 h-6" /> : <ScanFace className="w-6 h-6" />}
                                            <span className="text-[10px] font-black uppercase tracking-widest">Face ID</span>
                                            {newUser.faceEncoding.length > 0 && <span className="text-[8px] font-bold">Registered</span>}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleFingerprintEnroll}
                                            disabled={biometricLoading}
                                            className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${newUser.fingerprintId ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-400 hover:bg-slate-800'}`}
                                        >
                                            {biometricLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : newUser.fingerprintId ? <CheckCircle2 className="w-6 h-6" /> : <Fingerprint className="w-6 h-6" />}
                                            <span className="text-[10px] font-black uppercase tracking-widest">Print</span>
                                            {newUser.fingerprintId && <span className="text-[8px] font-bold">Registered</span>}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-10">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-4 text-slate-500 font-black uppercase tracking-widest hover:text-white transition-colors text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={biometricLoading}
                                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-black uppercase tracking-widest text-xs py-4 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                                >
                                    Create Account
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <CameraCaptureModal
                isOpen={showCamera}
                onClose={() => setShowCamera(false)}
                onCapture={handleFaceCapture}
                loading={biometricLoading}
            />
        </div>
    );
}

const LockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
);
