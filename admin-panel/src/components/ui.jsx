import React from 'react';
import { Inbox } from 'lucide-react';

export function TableSkeleton({ rows = 6, cols = 5, bare = false }) {
    const Wrap = bare ? React.Fragment : 'tbody';
    const wrapProps = bare ? {} : { 'aria-busy': 'true', 'aria-label': 'Loading' };
    return (
        <Wrap {...wrapProps}>
            {Array.from({ length: rows }).map((_, r) => (
                <tr key={r} className="animate-pulse border-b border-slate-100">
                    {Array.from({ length: cols }).map((__, c) => (
                        <td key={c} className="px-4 md:px-6 py-4">
                            <div className={`h-4 rounded bg-slate-100 ${c === 0 ? 'w-24' : c === 1 ? 'w-40' : 'w-20'}`} />
                        </td>
                    ))}
                </tr>
            ))}
        </Wrap>
    );
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
    return (
        <div className="flex flex-col items-center gap-2 text-center py-14 px-6">
            <span className="w-11 h-11 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center"><Icon className="w-5 h-5" /></span>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {hint && <div className="text-sm text-slate-500 max-w-sm">{hint}</div>}
            {action}
        </div>
    );
}

export function PageHeader({ title, subtitle, children }) {
    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1 tracking-tight">{title}</h1>
                {subtitle && <p className="text-slate-500 text-sm">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}
