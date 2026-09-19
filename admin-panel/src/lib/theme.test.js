import { describe, it, expect, beforeEach } from 'vitest';
import { getTheme, applyTheme, toggleTheme, syncConsoleTheme } from './theme';

describe('theme', () => {
    beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });

    it('defaults to light', () => { expect(getTheme()).toBe('light'); });
    it('applyTheme sets the html class and persists', () => {
        applyTheme('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(getTheme()).toBe('dark');
        applyTheme('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(getTheme()).toBe('light');
    });
    it('toggleTheme flips between light and dark', () => {
        expect(toggleTheme()).toBe('dark');
        expect(toggleTheme()).toBe('light');
    });
    it('syncConsoleTheme applies the saved theme and removes it on cleanup', () => {
        localStorage.setItem('aura_theme', 'dark');
        const cleanup = syncConsoleTheme();
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        cleanup();
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
