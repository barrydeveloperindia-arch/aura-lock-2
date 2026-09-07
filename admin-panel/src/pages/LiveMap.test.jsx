import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Leaflet needs a real layout engine; in jsdom we only check the page logic around it.
vi.mock('leaflet', () => {
    const chain = () => { const o = {}; ['addTo', 'bindPopup', 'openPopup', 'clearLayers', 'setView', 'fitBounds', 'flyTo', 'remove', 'on', 'removeLayer', 'bringToBack', 'zoomIn', 'zoomOut'].forEach(k => { o[k] = vi.fn(() => o); }); o.getZoom = () => 15; o.getContainer = () => document.createElement('div'); return o; };
    const bounds = () => ({ pad: () => 'bounds' });
    return { default: { map: () => chain(), tileLayer: () => chain(), layerGroup: () => chain(), marker: () => chain(), polyline: () => chain(), divIcon: (o) => o, latLngBounds: bounds } };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const rows = [
    { attendance_id: 'a1', employee_id: 'EMP-012', name: 'Gaurav Panchal', department: 'Mechanical Engineering', check_in: '2026-09-07T03:35:13Z', check_out: '2026-09-07T07:20:47Z', status: 'ON_TIME',
      in: { lat: 30.721805, lng: 76.852932, accuracy_m: 9, fix_time: 't', captured_at: 'c', source: 'terminal' },
      out: { lat: 30.721836, lng: 76.852475, accuracy_m: null, fix_time: 't', captured_at: 'c', source: 'terminal', place: 'EngLabs Office', nearest_place: { name: 'EngLabs Office', distance_m: 3, inside: true } } },
    { attendance_id: 'a2', employee_id: 'Emp-030', name: 'Aruti', department: 'Admin', check_in: '2026-09-07T07:12:40Z', check_out: null, status: 'LATE',
      in: { lat: 30.721806, lng: 76.85241, accuracy_m: 12, fix_time: 't', captured_at: 'c', source: 'terminal', place: 'EngLabs Office', nearest_place: { name: 'EngLabs Office', distance_m: 5, inside: true } }, out: null },
    { attendance_id: 'a3', employee_id: 'EMP-007', name: 'Parmod Bahl', department: null, check_in: '2026-09-07T07:10:19Z', check_out: null, status: 'LATE', in: null, out: null },
];

vi.mock('../services/api', () => ({
    apiService: {
        getAttendanceLocations: vi.fn(async () => ({ date: '2026-09-07', generated_at: 'now', rows })),
        getAvatars: vi.fn(async () => ({ avatars: {} })),
        getEngineHealth: vi.fn(async () => ({ status: 'ready' })),
        getDoorStatus: vi.fn(async () => ({ online: true, locked: true })),
        getAttendancePhoto: vi.fn(async (id, kind) => ({ url: 'https://signed.example/' + id + '_' + kind + '.jpg', kind, address: 'Industrial Area Phase 8B, Mohali, Punjab 160055, India', location: { lat: 30.721836, lng: 76.852475, accuracy_m: 14 } })),
    },
}));

import LiveMap from './LiveMap';
import { groupPoints, lastPoint, distanceM } from '../lib/liveMapPoints';
import { apiService } from '../services/api';

describe('LiveMap helpers', () => {
    it('uses the check-out fix when present, else the check-in fix, else nothing', () => {
        expect(lastPoint(rows[0]).kind).toBe('out');
        expect(lastPoint(rows[1]).kind).toBe('in');
        expect(lastPoint(rows[2])).toBeNull();
    });
    it('groups fixes within 25 m into one marker and counts who is still in', () => {
        const groups = groupPoints(rows);
        expect(groups).toHaveLength(1);
        expect(groups[0].members).toHaveLength(2);
        expect(groups[0].present).toBe(1);
        const apart = groupPoints([rows[0], { ...rows[1], in: { ...rows[1].in, lat: 30.73 } }]);
        expect(apart).toHaveLength(2);
        expect(Math.round(distanceM({ lat: 30.721805, lng: 76.852932 }, { lat: 30.721836, lng: 76.852475 }))).toBe(44);
    });
});

describe('LiveMap page', () => {
    beforeEach(() => vi.clearAllMocks());

    it('lists everyone present (desktop panel + phone sheet), marks who has no GPS, and counts the filters', async () => {
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getAllByText('Gaurav Panchal').length).toBeGreaterThan(0));
        expect(apiService.getAttendanceLocations).toHaveBeenCalledTimes(1);
        expect(screen.getAllByText('Aruti').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/No GPS on this scan/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/2 located of 3 present/i).length).toBeGreaterThan(0);
        for (const label of ['All · 3', 'In now · 2', 'Checked out · 1', 'Off-site · 0', 'No GPS · 1']) expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
        expect(screen.getAllByText(/EngLabs Office/).length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.getByText('Engine ready')).toBeInTheDocument());
        expect(screen.getByText('Door locked')).toBeInTheDocument();
    });

    it('filter chips and search narrow the list', async () => {
        const { fireEvent } = await import('@testing-library/react');
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getAllByText('Gaurav Panchal').length).toBeGreaterThan(0));
        fireEvent.click(screen.getByRole('button', { name: 'In now · 2' }));
        expect(screen.queryByText('Gaurav Panchal')).not.toBeInTheDocument();
        expect(screen.getAllByText('Aruti').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: 'All · 3' }));
        fireEvent.change(screen.getByLabelText('Search staff'), { target: { value: 'parmod' } });
        expect(screen.queryByText('Aruti')).not.toBeInTheDocument();
        expect(screen.getAllByText('Parmod Bahl').length).toBeGreaterThan(0);
    });

    it('clicking a person opens their check-in card with photo, address, time and coordinates', async () => {
        const { fireEvent } = await import('@testing-library/react');
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getAllByText('Gaurav Panchal').length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByText('Gaurav Panchal')[0]);
        // Gaurav has a check-out fix, so the card opens on OUT
        await waitFor(() => expect(screen.getByRole('img', { name: /Gaurav Panchal check-out/i })).toBeInTheDocument());
        expect(apiService.getAttendancePhoto).toHaveBeenCalledWith('a1', 'out');
        expect(screen.getByText('Mechanical Engineering: Check-out')).toBeInTheDocument();
        expect(screen.getByText('Industrial Area Phase 8B, Mohali, Punjab 160055, India')).toBeInTheDocument();
        expect(screen.getByText(/30.721836, 76.852475/)).toBeInTheDocument();
        expect(screen.getByText(/Industrial Area Phase 8B/)).toBeInTheDocument();
        expect(screen.getAllByText(/EngLabs Office/).length).toBeGreaterThan(0);
        expect(screen.getByText('Open in Google Maps')).toHaveAttribute('href', 'https://www.google.com/maps?q=30.721836,76.852475');
        // switch to IN, then back to the list
        fireEvent.click(screen.getByRole('button', { name: 'IN' }));
        await waitFor(() => expect(apiService.getAttendancePhoto).toHaveBeenCalledWith('a1', 'in'));
        fireEvent.click(screen.getByLabelText('Close'));
        expect(screen.getAllByText('Parmod Bahl').length).toBeGreaterThan(0);
    });

    it('shows an error banner when the API fails', async () => {
        apiService.getAttendanceLocations.mockRejectedValueOnce({ response: { data: { error: 'boom' } } });
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getAllByText('boom').length).toBeGreaterThan(0));
    });
});
