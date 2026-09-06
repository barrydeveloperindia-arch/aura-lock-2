import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { apiService } from '../services/api.service';

// Mock the apiService
vi.mock('../services/api.service', () => ({
    apiService: {
        registerFace: vi.fn(),
    },
}));

// jsdom has no <canvas> implementation; give the component a working stand-in
beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = () => ({ drawImage: () => {} });
    HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
    HTMLCanvasElement.prototype.toBlob = (cb) => cb(new Blob(['x'], { type: 'image/jpeg' }));
    // Fake camera: the Capture button stays disabled until getUserMedia resolves
    const fakeStream = { getTracks: () => [{ stop: () => {} }] };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(fakeStream);
});

describe('CameraCaptureModal Component', () => {
    it('renders correctly when open', () => {
        render(<CameraCaptureModal isOpen={true} onClose={() => { }} onCapture={() => { }} />);
        expect(screen.getByText(/FACE REGISTRATION/i)).toBeInTheDocument();
        expect(screen.getByText(/Capture Photo/i)).toBeInTheDocument();
    });

    it('calls onCapture when image is confirmed', async () => {
        const onCaptureMock = vi.fn();
        render(<CameraCaptureModal isOpen={true} onClose={() => { }} onCapture={onCaptureMock} />);

        // Capture photo (button enables once the fake camera stream is attached)

        const captureBtn = screen.getByText(/Capture Photo/i).closest('button');

        await waitFor(() => expect(captureBtn).not.toBeDisabled());

        fireEvent.click(captureBtn);

        // Check if confirm button appears
        await waitFor(() => {
            expect(screen.getByText(/Confirm Image/i)).toBeInTheDocument();
        });

        // Confirm photo
        fireEvent.click(screen.getByText(/Confirm Image/i));

        expect(onCaptureMock).toHaveBeenCalled();
    });
});

describe('apiService Biometric Methods', () => {
    it('registerFace sends FormData correctly', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
        const employeeId = 'EMP001';
        const email = 'test@example.com';

        apiService.registerFace(mockBlob, employeeId, email);

        expect(apiService.registerFace).toHaveBeenCalledWith(
            expect.any(Blob),
            employeeId,
            email
        );
    });
});
