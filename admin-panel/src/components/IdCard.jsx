import React from 'react';
import BrandLogo from './BrandLogo';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Printable staff ID card sized to a real CR80 card (3.375in x 2.125in).
export default function IdCard({ user, photoUrl, id }) {
    const initials = (user.name || '?').slice(0, 2).toUpperCase();
    return (
        <div id={id}
            className="id-card mx-auto w-[3.375in] h-[2.125in] rounded-[0.09in] overflow-hidden shadow-2xl bg-white text-[#101425] flex flex-col relative"
            style={{ fontFamily: 'inherit' }}>
            <div className="h-[0.46in] shrink-0 bg-gradient-to-r from-[#081226] to-[#0f2a52] flex items-center gap-[0.06in] px-[0.13in] relative overflow-hidden">
                <BrandLogo variant="mark" className="absolute -right-3 -top-3 w-16 h-16 opacity-[0.12]" />
                <BrandLogo variant="mark" className="w-[0.24in] h-[0.24in] shrink-0" />
                <div className="leading-tight">
                    <div className="text-white text-[10.5px] font-bold">ENGLABS INDIA PVT LTD</div>
                    <div className="text-[#8fb8f0] text-xs font-bold">Staff Identity Card</div>
                </div>
                <div className="ml-auto text-right leading-tight">
                    <div className="text-[6px] text-[#8fb8f0] font-bold">Valid Employee</div>
                    <div className="text-white text-xs font-bold font-mono">{user.employee_id}</div>
                </div>
            </div>

            <div className="flex-1 flex gap-[0.14in] px-[0.14in] pt-[0.08in] pb-[0.04in]">
                <div className="shrink-0 -mt-[0.18in]">
                    <div className="w-[0.92in] h-[0.92in] rounded-[0.08in] overflow-hidden border-[2.5px] border-white shadow-md bg-gradient-to-br from-[#0f2a52] to-[#1a4a8f] flex items-center justify-center text-white font-bold text-[20px]">
                        {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initials}
                    </div>
                    {user.blood_group && (
                        <div className="mt-[0.035in] text-center bg-[#c0281f] text-white text-[6px] font-bold rounded-[0.03in] py-[0.02in]">
                            {user.blood_group}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 leading-tight pt-[0.02in]">
                    <div className="text-[13.5px] font-bold truncate tracking-tight">{user.name}</div>
                    <div className="inline-block mt-[0.02in] px-[0.06in] py-[0.015in] rounded-[0.03in] bg-[#fdf1de] text-[#9a5b12] text-[7.5px] font-bold truncate max-w-full">
                        {user.designation || 'Staff'}
                    </div>

                    <div className="mt-[0.05in] grid grid-cols-2 gap-x-[0.08in] gap-y-[0.025in] text-[6.5px]">
                        <div><div className="text-[5px] font-bold text-slate-600">Company</div><div className="font-bold truncate">{user.company || 'Englabs India Pvt Ltd'}</div></div>
                        <div><div className="text-[5px] font-bold text-slate-600">Department</div><div className="font-bold truncate">{user.department || 'General'}</div></div>
                        <div><div className="text-[5px] font-bold text-slate-600">Joined</div><div className="font-bold">{fmtDate(user.joining_date)}</div></div>
                        <div><div className="text-[5px] font-bold text-slate-600">Contact</div><div className="font-bold">{user.contact_number || '—'}</div></div>
                        <div><div className="text-[5px] font-bold text-slate-600">PAN</div><div className="font-bold font-mono truncate">{user.pan_number || '—'}</div></div>
                        <div className="min-w-0"><div className="text-[5px] font-bold text-slate-600">Address</div><div className="font-bold truncate" title={user.address || ''}>{user.address || '—'}</div></div>
                    </div>
                </div>
            </div>

            <div className="shrink-0 px-[0.14in] pb-[0.05in] flex items-end justify-between">
                <div className="text-[6px] text-slate-600 font-semibold leading-tight max-w-[1.6in]">
                    If found, please return to Englabs India Pvt Ltd, MDC Sector 4, Panchkula
                </div>
                <div className="text-right">
                    <div className="w-[0.85in] border-b border-slate-300 mb-[0.015in]" />
                    <div className="text-[6px] text-slate-600 font-bold">Authorized Signatory</div>
                </div>
            </div>

            <div className="h-[0.09in] shrink-0 bg-gradient-to-r from-[#0f2a52] via-[#c0281f] to-[#0f2a52]" />
        </div>
    );
}
