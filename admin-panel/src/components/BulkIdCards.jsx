import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import IdCard from './IdCard';

// Print sheet: 2 cards across on A4, never split a card across pages. Everything else on the
// page is hidden while printing; only the portal root below is shown.
const PRINT_CSS = `
@media print {
    body > *:not(#bulk-id-print-root) { display: none !important; }
    #bulk-id-print-root { display: block !important; }
    #bulk-id-print-root .sheet { display: grid; grid-template-columns: repeat(2, 3.375in); gap: 0.2in; justify-content: center; }
    #bulk-id-print-root .id-card { box-shadow: none !important; break-inside: avoid; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 0.4in; }
}
#bulk-id-print-root { display: none; }
`;

export default function BulkIdCards({ users, photoFor, onClose }) {
    return (
        <>
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-label="Print ID cards">
                <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-xl border border-slate-200 shadow-2xl">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Print ID cards</h2>
                            <p className="text-sm text-slate-500">{users.length} {users.length === 1 ? 'card' : 'cards'} &middot; A4 sheet, two across. Choose &ldquo;Save as PDF&rdquo; in the print dialog to keep a copy.</p>
                        </div>
                        <button onClick={onClose} aria-label="Close" className="p-1 text-slate-500 hover:text-slate-900"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 bg-slate-50">
                        <div className="grid gap-6 justify-center" style={{ gridTemplateColumns: 'repeat(auto-fit, 3.375in)' }}>
                            {users.map(u => <IdCard key={u.id} user={u} photoUrl={photoFor(u)} />)}
                        </div>
                    </div>
                    <div className="flex gap-3 px-5 py-4 border-t border-slate-200 justify-end">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50">Close</button>
                        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm">
                            <Printer className="w-4 h-4" /> Print {users.length} {users.length === 1 ? 'card' : 'cards'}
                        </button>
                    </div>
                </div>
            </div>
            {createPortal(
                <div id="bulk-id-print-root">
                    <style>{PRINT_CSS}</style>
                    <div className="sheet">
                        {users.map(u => <IdCard key={u.id} user={u} photoUrl={photoFor(u)} />)}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
