const KEY = 'aura_theme';

export function getTheme() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

export function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: theme just won't persist */ }
    return theme;
}

export function toggleTheme() {
    return applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
}

// The dark class belongs to the admin console only; login, home and the scanner keep their light design.
export function syncConsoleTheme() {
    document.documentElement.classList.toggle('dark', getTheme() === 'dark');
    return () => document.documentElement.classList.remove('dark');
}
