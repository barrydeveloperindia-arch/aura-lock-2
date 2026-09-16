import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { Building2, User, Briefcase, MapPin, ChevronDown } from 'lucide-react';

// Disha Arcade, MDC Sector 4, Panchkula -- floors top to bottom. `department` on the employee
// record doubles as "which company" for the handful of staff who belong to a different
// building tenant (Sky 5 Hotel, A & A, Bright Kids School); everyone else is Englabs, whatever
// their internal department string says.
const OTHER_TENANTS = {
    'A & A': { floor: '6th Floor', company: 'A & A Architect' },
    'Sky 5 Hotel': { floor: '5th Floor', company: 'Sky5 Hotel' },
    'Bright Kids School': { floor: '1st Floor', company: 'Bright Kids School' },
};
const ENGLABS_FLOOR = { floor: '2nd Floor', company: 'Englabs India Pvt Ltd' };

// Floors with no staff tracked in this system, shown for context only.
const INFO_ONLY_FLOORS = [
    { floor: 'Ground Floor', tenants: ['Shops', 'Post Office', 'ATM', 'PB Electric Pump'] },
    { floor: '3rd Floor', tenants: ['PG Rooms'] },
    { floor: '4th Floor', tenants: ['Offices — Other Companies'] },
];

function groupByFloor(users) {
    const groups = {};
    for (const u of users) {
        const tenant = OTHER_TENANTS[u.department] || ENGLABS_FLOOR;
        if (!groups[tenant.floor]) groups[tenant.floor] = { company: tenant.company, staff: [] };
        groups[tenant.floor].staff.push(u);
    }
    return groups;
}

const FLOOR_ORDER = ['6th Floor', '5th Floor', '4th Floor', '3rd Floor', '2nd Floor', '1st Floor', 'Ground Floor'];

export default function BuildingDirectory() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openFloor, setOpenFloor] = useState(null);

    useEffect(() => {
        apiService.getUsers().then(data => setUsers(Array.isArray(data) ? data.filter(u => u.status !== 'Disabled') : []))
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, []);

    const grouped = groupByFloor(users);
    const floors = FLOOR_ORDER
        .map(floor => ({ floor, group: grouped[floor], info: INFO_ONLY_FLOORS.find(f => f.floor === floor) }))
        .filter(f => f.group || f.info);
    const active = floors.find(f => f.floor === openFloor);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div>
                <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter">Building Directory</h1>
                <p className="text-slate-500 text-sm font-medium uppercase tracking-[0.2em]">
                    Disha Arcade // MDC, Sector 4, Panchkula, Haryana 134114
                </p>
            </div>

            {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />)}
                </div>
            ) : (
                <>
                    {/* Floor tile grid — overview at a glance */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {floors.map(({ floor, group, info }) => {
                            const isOpen = openFloor === floor;
                            return (
                                <button key={floor} onClick={() => setOpenFloor(isOpen ? null : floor)}
                                    className={`text-left p-5 rounded-2xl border transition-all ${isOpen
                                        ? 'bg-amber-50 border-amber-300 shadow-sm'
                                        : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/40'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                            <Building2 className="w-4 h-4 text-amber-600" />
                                        </div>
                                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </div>
                                    <div className="text-sm font-black text-slate-900">{floor}</div>
                                    <div className="text-xs text-slate-500 font-semibold truncate mt-0.5">
                                        {group ? group.company : info.tenants.join(' · ')}
                                    </div>
                                    <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest mt-2">
                                        {group ? `${group.staff.length} ${group.staff.length === 1 ? 'Person' : 'People'}` : 'No staff tracked'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Expanded detail panel for the selected floor */}
                    {active && (
                        <div className="rounded-3xl bg-white border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="px-6 md:px-8 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <div className="text-sm font-black text-slate-900">
                                        {active.floor} · {active.group ? active.group.company : active.info.tenants.join(' · ')}
                                    </div>
                                </div>
                                {active.group && (
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        {active.group.staff.length} {active.group.staff.length === 1 ? 'Person' : 'People'}
                                    </span>
                                )}
                            </div>

                            {active.group ? (
                                <div className="divide-y divide-slate-100">
                                    {active.group.staff.map(u => (
                                        <div key={u.id} className="px-6 md:px-8 py-3 flex items-center justify-between gap-4 flex-wrap">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                                                    <User className="w-3.5 h-3.5 text-blue-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-slate-900 truncate">{u.name}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono truncate">{u.employee_id}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
                                                <Briefcase className="w-3 h-3 text-slate-400" />
                                                {u.designation || 'Not added'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="px-6 md:px-8 py-5 flex items-center gap-2 text-xs text-slate-400 font-semibold">
                                    <MapPin className="w-3.5 h-3.5" /> No staff tracked in this system for this floor.
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
