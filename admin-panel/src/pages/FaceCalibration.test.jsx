import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

const report = {
    total: 3, no_face: 0,
    genuine: { n: 2, min: 0.42, max: 0.55, mean: 0.485, p95: 0.55 },
    impostor: { n: 1, min: 0.75, max: 0.75, mean: 0.75, p95: 0.75 },
    misidentified: 0, current_threshold: 0.9, current_false_accepts: 1, current_false_rejects: 0,
    suggestion: { threshold: 0.65, clean_gap: true, false_rejects: 0, false_accepts: 0, reason: 'Clean gap.' },
    employees: [
        { employee_id: 'EMP-012', name: 'Gaurav Panchal', scans: 2, correct: 2, wrong: 0, min: 0.42, max: 0.55, pass_now: 2, pass_suggested: 2 },
        { employee_id: 'VISITOR', name: 'Visitor / not enrolled', scans: 1, correct: 0, wrong: 0, min: 0.75, max: 0.75, pass_now: null, pass_suggested: null },
    ],
};
const rows = [
    { at: '2026-09-07T11:00:00Z', claimed_id: 'EMP-012', claimed_name: 'Gaurav Panchal', condition: 'normal', face_found: true, matched_id: 'EMP-012', matched_name: 'Gaurav Panchal', distance: 0.42 },
    { at: '2026-09-07T11:01:00Z', claimed_id: '', claimed_name: 'Visitor', condition: 'normal', face_found: true, matched_id: 'EMP-007', matched_name: 'Parmod Bahl', distance: 0.75 },
];

vi.mock('../services/api', () => ({
    apiService: {
        getUsers: vi.fn(async () => [
            { employee_id: 'EMP-012', name: 'Gaurav Panchal', status: 'Active', is_deleted: false },
            { employee_id: 'EMP-007', name: 'Parmod Bahl', status: 'Active', is_deleted: false },
            { employee_id: 'EMP-001', name: 'Old Staff', status: 'Disabled', is_deleted: true },
        ]),
        getCalibrationReport: vi.fn(async () => ({ session: '2026-09-07', threshold: 0.9, rows, report })),
        measureFace: vi.fn(async () => ({
            result: { success: true, face_found: true, best: { employee_id: 'EMP-012', name: 'Gaurav Panchal', distance: 0.47 }, second: { employee_id: 'EMP-007', distance: 0.68 }, gap: 0.21, threshold: 0.9, would_pass: true },
            record: { claimed_id: 'EMP-012', matched_id: 'EMP-012', distance: 0.47 },
            rows: [...rows, { at: '2026-09-07T11:02:00Z', claimed_id: 'EMP-012', claimed_name: 'Gaurav Panchal', condition: 'glasses', face_found: true, matched_id: 'EMP-012', matched_name: 'Gaurav Panchal', distance: 0.47 }],
            report: { ...report, total: 4 },
        })),
        undoLastMeasurement: vi.fn(async () => ({ removed: rows[1], rows: [rows[0]], report: { ...report, total: 1 } })),
    },
}));

import FaceCalibration from './FaceCalibration';
import { apiService } from '../services/api';

describe('FaceCalibration page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // jsdom has no camera: pretend one opened and that the video has a frame
        const track = { stop: vi.fn() };
        Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track] })) } });
        Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: vi.fn(async () => {}) });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
        Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
        HTMLCanvasElement.prototype.toBlob = vi.fn((cb) => cb(new Blob(['x'], { type: 'image/jpeg' })));
    });

    it('lists only active staff, shows the session report and the suggested threshold', async () => {
        render(<FaceCalibration />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getByText(/Suggested threshold: 0.65/)).toBeInTheDocument());
        const select = screen.getByLabelText('Person');
        expect(select.options.length).toBe(3); // visitor + 2 active
        expect(screen.queryByText(/Old Staff/)).not.toBeInTheDocument();
        expect(screen.getByText(/1 visitor scan\(s\) would pass/)).toBeInTheDocument();
        expect(screen.getAllByText('2/2').length).toBeGreaterThanOrEqual(2); // recognised + pass now + pass suggested
    });

    it('measures the current frame with the chosen person and condition, then shows the engine verdict', async () => {
        render(<FaceCalibration />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getByRole('button', { name: /Measure/ })).toBeEnabled());
        fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'EMP-012' } });
        fireEvent.click(screen.getByRole('button', { name: 'Glasses' }));
        fireEvent.click(screen.getByRole('button', { name: /Measure/ }));
        await waitFor(() => expect(apiService.measureFace).toHaveBeenCalledTimes(1));
        const fd = apiService.measureFace.mock.calls[0][0];
        expect(fd.get('claimed_id')).toBe('EMP-012');
        expect(fd.get('condition')).toBe('glasses');
        expect(fd.get('file')).toBeTruthy();
        await waitFor(() => expect(screen.getByText(/would PASS/)).toBeInTheDocument());
        expect(screen.getByText('4')).toBeInTheDocument(); // scans tile updated from the response
    });

    it('undo removes the last measurement', async () => {
        render(<FaceCalibration />, { wrapper: BrowserRouter });
        await waitFor(() => expect(screen.getByLabelText('Undo last measurement')).toBeEnabled());
        fireEvent.click(screen.getByLabelText('Undo last measurement'));
        await waitFor(() => expect(apiService.undoLastMeasurement).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))); // today's session
    });
});
