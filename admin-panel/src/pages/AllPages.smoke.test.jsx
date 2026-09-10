import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Every apiService call resolves to something empty but well-shaped, so each
// page must at least mount and paint its frame without throwing.
vi.mock('../services/api', () => {
    const list = vi.fn(async () => []);
    const obj = vi.fn(async () => ({}));
    const apiService = new Proxy({}, {
        get: (_t, name) => {
            if (typeof name !== 'string') return undefined;
            return /^get(Users|Employees|Attendance|Logs|AccessLogs|Leaves|Holidays|Departments)$/.test(name) ? list : obj;
        },
    });
    return { apiService };
});
vi.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => <div>{children}</div>, TileLayer: () => null, Marker: ({ children }) => <div>{children}</div>,
    Popup: ({ children }) => <div>{children}</div>, Polyline: () => null, CircleMarker: () => null, useMap: () => ({ fitBounds: vi.fn(), setView: vi.fn() }),
}));

const pages = import.meta.glob(['./*.jsx', '!./*.test.jsx'], { eager: true });

describe('every admin page mounts', () => {
    for (const [file, mod] of Object.entries(pages)) {
        if (file.includes('.test.') || file.includes('.smoke.')) continue;
        const Page = mod.default;
        if (typeof Page !== 'function') continue;
        it(file, () => {
            const errors = [];
            const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
            try {
                const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
                expect(container.firstChild).not.toBeNull();
            } finally { spy.mockRestore(); }
            const crash = errors.find(e => /is not defined|Cannot read|is not a function/.test(e));
            expect(crash, crash).toBeUndefined();
        });
    }
});
