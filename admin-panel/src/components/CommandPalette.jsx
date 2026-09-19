import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft, User, LayoutDashboard } from 'lucide-react';
import { apiService } from '../services/api';
import { filterPalette } from '../lib/palette';

export default function CommandPalette() {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [users, setUsers] = useState([]);
    const [usersReady, setUsersReady] = useState(false);
    const loaded = useRef(false);
    const inputRef = useRef(null);

    const show = () => { setQuery(''); setActive(0); setOpen(true); };
    const toggle = () => setOpen(o => { if (!o) { setQuery(''); setActive(0); } return !o; });

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle(); }
            else if (e.key === 'Escape') setOpen(false);
        };
        const onOpen = () => show();
        window.addEventListener('keydown', onKey);
        window.addEventListener('open-command-palette', onOpen);
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-command-palette', onOpen); };
    }, []);

    useEffect(() => {
        if (!open) return;
        setTimeout(() => inputRef.current?.focus(), 0);
        if (!loaded.current) {
            loaded.current = true;
            apiService.getUsers().then(d => { setUsers(Array.isArray(d) ? d : []); setUsersReady(true); }).catch(() => { loaded.current = false; });
        }
    }, [open]);

    const results = useMemo(() => filterPalette(query, users), [query, users]);

    const go = (item) => { if (!item) return; setOpen(false); navigate(item.path); };
    const onInputKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4 bg-slate-900/40 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
            <div role="dialog" aria-label="Search" className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden" onMouseDown={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4 border-b border-slate-200">
                    <Search className="w-4 h-4 text-slate-500" />
                    <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={onInputKey}
                        placeholder="Search staff by name or ID, or jump to a page…" aria-label="Search staff or pages"
                        className="flex-1 py-3.5 text-sm text-slate-900 placeholder:text-slate-500 bg-transparent outline-none" />
                    <kbd className="text-xs text-slate-500 border border-slate-200 rounded px-1.5 py-0.5">Esc</kbd>
                </div>
                <ul role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
                    {results.length === 0 && <li className="px-4 py-6 text-sm text-slate-500 text-center">{usersReady ? `No staff or page matches “${query}”.` : 'Loading staff…'}</li>}
                    {results.map((r, i) => (
                        <li key={r.kind + r.key} role="option" aria-selected={i === active}>
                            <button type="button" onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-blue-50' : ''}`}>
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.kind === 'person' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                                    {r.kind === 'person' ? <User className="w-4 h-4" /> : <LayoutDashboard className="w-4 h-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-slate-900 truncate">{r.title}</span>
                                    <span className="block text-xs text-slate-500 truncate">{r.sub}</span>
                                </span>
                                {i === active && <CornerDownLeft className="w-4 h-4 text-slate-500" />}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
