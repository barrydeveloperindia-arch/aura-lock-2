import React, { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw, Search, ArrowRight } from 'lucide-react';
import { apiService } from '../services/api';
import { TableSkeleton, EmptyState, PageHeader } from '../components/ui';
import { fmtIst } from '../lib/format';

const ACTION_LABELS = {
    'employee.create': { label: 'Employee added', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'employee.update': { label: 'Employee edited', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
    'employee.photo': { label: 'Photo uploaded', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'employee.delete': { label: 'Employee removed', tone: 'bg-red-50 text-red-700 border-red-200' },
    'employee.delete.hard': { label: 'Employee purged', tone: 'bg-red-50 text-red-700 border-red-200' },
    'leave.add': { label: 'Leave added', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
    'leave.status': { label: 'Leave decision', tone: 'bg-amber-50 text-amber-800 border-amber-200' },
    'leave.delete': { label: 'Leave removed', tone: 'bg-red-50 text-red-700 border-red-200' },
};

const FIELD_LABELS = {
    name: 'Name', department: 'Department', company: 'Company', designation: 'Designation', status: 'Status', email: 'Email',
    joining_date: 'Joining date', last_working_day: 'Last working day', pan_number: 'PAN', aadhaar_number: 'Aadhaar',
    date_of_birth: 'Date of birth', gender: 'Gender', blood_group: 'Blood group', father_mother_name: 'Father / mother',
    spouse_name: 'Spouse', location: 'Location', contact_number: 'Contact', address: 'Address', bank_name: 'Bank',
    bank_branch: 'Branch', bank_account_number: 'Account number', bank_ifsc: 'IFSC', employee_id: 'Employee ID',
    profile_photo: 'ID card photo', date: 'Date', type: 'Type', approved_by: 'Approved by', days: 'Days', from: 'From', to: 'To',
};

const show = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function Changes({ changes }) {
    const entries = Object.entries(changes || {});
    if (entries.length === 0) return <span className="text-slate-500">—</span>;
    return (
        <ul className="space-y-1">
            {entries.map(([field, c]) => (
                <li key={field} className="text-sm text-slate-700 flex flex-wrap items-center gap-x-1.5">
                    <span className="font-medium text-slate-900">{FIELD_LABELS[field] || field}:</span>
                    <span className="text-slate-500 break-all">{show(c?.from)}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-900 break-all">{show(c?.to)}</span>
                </li>
            ))}
        </ul>
    );
}

export default function AuditTrail() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [entityType, setEntityType] = useState('');
    const [q, setQ] = useState('');
    const [debouncedQ, setDebouncedQ] = useState('');

    useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await apiService.getAuditLog({ entity_type: entityType || undefined, q: debouncedQ || undefined, limit: 200 });
            setEntries(data.entries || []);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Could not load the audit trail.');
        } finally { setLoading(false); }
    }, [entityType, debouncedQ]);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            <PageHeader title="Audit Trail" subtitle="Who changed what, and when. Aadhaar, PAN and bank numbers are always stored masked.">
                <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-slate-700 text-sm font-medium shadow-sm">
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </PageHeader>

            <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search person, admin or action…" aria-label="Search audit trail"
                            className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                    <select value={entityType} onChange={e => setEntityType(e.target.value)} aria-label="Filter by record type"
                        className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500">
                        <option value="">All records</option>
                        <option value="employee">Employees</option>
                        <option value="leave">Leaves</option>
                    </select>
                    <span className="text-sm text-slate-500 ml-auto tabular-nums">{loading ? 'Loading…' : `${entries.length} entries`}</span>
                </div>

                {error ? (
                    <EmptyState icon={History} title="Audit trail unavailable" hint={error} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                    {['When (IST)', 'Who', 'Action', 'Record', 'Changes'].map(h => (
                                        <th key={h} className="px-4 md:px-6 py-3 text-xs font-semibold text-slate-600">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            {loading && entries.length === 0 ? <TableSkeleton rows={6} cols={5} /> : (
                                <tbody className="divide-y divide-slate-200">
                                    {entries.length === 0 ? (
                                        <tr><td colSpan={5}><EmptyState icon={History} title="No changes recorded yet" hint="Edits to staff records and leaves will appear here as they happen." /></td></tr>
                                    ) : entries.map(e => {
                                        const a = ACTION_LABELS[e.action] || { label: e.action, tone: 'bg-slate-50 text-slate-700 border-slate-200' };
                                        return (
                                            <tr key={e.id} className="align-top hover:bg-slate-50">
                                                <td className="px-4 md:px-6 py-3 text-sm text-slate-700 whitespace-nowrap tabular-nums">{fmtIst(e.created_at)}</td>
                                                <td className="px-4 md:px-6 py-3 text-sm text-slate-700">{e.actor}</td>
                                                <td className="px-4 md:px-6 py-3"><span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-semibold whitespace-nowrap ${a.tone}`}>{a.label}</span></td>
                                                <td className="px-4 md:px-6 py-3 text-sm font-semibold text-slate-900">{e.entity_label || '—'}</td>
                                                <td className="px-4 md:px-6 py-3"><Changes changes={e.changes} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            )}
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
