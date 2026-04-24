
import React, { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { mockApi } from '../../services/mockApi';

export default function DevicesPage() {
    const [devices, setDevices] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadDevices = async () => {
        setRefreshing(true);
        const data = await mockApi.getDevices();
        setDevices(data);
        setTimeout(() => setRefreshing(false), 500);
    };

    useEffect(() => {
        loadDevices();
    }, []);

    const handleUnlock = async (id) => {
        await mockApi.unlockDoor(id);
        alert(`Door ${id} unlocked remotely!`);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-white">Device Management</h1>
                <button
                    onClick={loadDevices}
                    title="Refresh Status"
                    className={`p-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all ${refreshing ? 'animate-spin' : ''}`}
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {devices.map((device) => (
                    <div key={device.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between h-48 relative overflow-hidden group hover:border-blue-500/30 transition-all">
                        <div className={`absolute top-0 right-0 p-3 rounded-bl-2xl ${device.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                            {device.status === 'online' ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                        </div>

                        <div>
                            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-4 text-blue-400">
                                <Server className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-white">{device.name}</h3>
                            <p className="text-slate-500 text-sm font-mono mt-1">{device.id}</p>
                        </div>

                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/50">
                            <span className="text-xs text-slate-600">Last heartbeat: {new Date(device.lastActivity).toLocaleTimeString()}</span>
                            {device.status === 'online' && (
                                <button
                                    onClick={() => handleUnlock(device.id)}
                                    className="text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider"
                                >
                                    Unlock
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
