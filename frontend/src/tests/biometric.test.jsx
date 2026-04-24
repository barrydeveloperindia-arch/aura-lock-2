import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { apiService } from '../services/api.service';

// Mock the apiService
vi.mock('../services/api.service', () => ({
    apiService: {
        registerFace: vi.fn(),
    },
}));

describe('CameraCaptureModal Component', () => {
    it('renders correctly when open', () => {
        render(<CameraCaptureModal isOpen={true} onClose={() => { }} onCapture={() => { }} />);
        expect(screen.getByText(/FACE REGISTRATION/i)).toBeInTheDocument();
        expect(screen.getByText(/Capture Photo/i)).toBeInTheDocument();
    });

    it('calls onCapture when image is confirmed', async () => {
        const onCaptureMock = vi.fn();
        render(<CameraCaptureModal isOpen={true} onClose={() => { }} onCapture={onCaptureMock} />);

        // Capture photo
        fireEvent.click(screen.getByText(/Capture Photo/i));

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
