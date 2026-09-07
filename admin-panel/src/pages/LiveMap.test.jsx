import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Leaflet needs a real layout engine; in jsdom we only check the page logic around it.
vi.mock('leaflet', () => {
    const chain = () => { const o = {}; ['addTo', 'bindPopup', 'openPopup', 'clearLayers', 'setView', 'fitBounds', 'flyTo', 'remove'].forEach(k => { o[k] = vi.fn(() => o); }); o.getZoom = () => 15; return o; };
    const bounds = () => ({ pad: () => 'bounds' });
    return { default: { map: () => chain(), tileLayer: () => chain(), layerGroup: () => chain(), marker: () => chain(), divIcon: (o) => o, latLngBounds: bounds } };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));

const rows = [
    { attendance_id: 'a1', employee_id: 'EMP-012', name: 'Gaurav Panchal', department: 'Mechanical Engineering', check_in: '2026-09-07T03:35:13Z', check_out: '2026-09-07T07:20:47Z', status: 'ON_TIME',
      in: { lat: 30.721805, lng: 76.852932, accuracy_m: 9, fix_time: 't', captured_at: 'c', source: 'terminal' },
      out: { lat: 30.721836, lng: 76.852475, accuracy_m: null, fix_time: 't', captured_at: 'c', source: 'terminal' } },
    { attendance_id: 'a2', employee_id: 'Emp-030', name: 'Aruti', department: 'Admin', check_in: '2026-09-07T07:12:40Z', check_out: null, status: 'LATE',
      in: { lat: 30.721806, lng: 76.85241, accuracy_m: 12, fix_time: 't', captured_at: 'c', source: 'terminal' }, out: null },
    { attendance_id: 'a3', employee_id: 'EMP-007', name: 'Parmod Bahl', department: null, check_in: '2026-09-07T07:10:19Z', check_out: null, status: 'LATE', in: null, out: null },
];

vi.mock('../services/api', () => ({
    apiService: {
        getAttendanceLocations: vi.fn(async () => ({ date: '2026-09-07', generated_at: 'now', rows })),
        getAvatars: vi.fn(async () => ({ avatars: {} })),
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

    it('lists everyone present, marks who has no GPS, and shows the counts', async () => {
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getByText('Gaurav Panchal')).toBeInTheDocument());
        expect(apiService.getAttendanceLocations).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Aruti')).toBeInTheDocument();
        expect(screen.getByText('Parmod Bahl')).toBeInTheDocument();
        expect(screen.getAllByText('No GPS')).toHaveLength(1);
        expect(screen.getByText(/located of 3 present/i)).toBeInTheDocument();
        const tile = (label) => screen.getByText(label).previousSibling.textContent;
        expect([tile('Present'), tile('Located'), tile('In now'), tile('Checked out')]).toEqual(['3', '2', '2', '1']);
    });

    it('shows an error banner when the API fails', async () => {
        apiService.getAttendanceLocations.mockRejectedValueOnce({ response: { data: { error: 'boom' } } });
        render(<LiveMap />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument());
    });
});
