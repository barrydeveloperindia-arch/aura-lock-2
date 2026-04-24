import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock MediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
        getUserMedia: vi.fn().mockResolvedValue({
            getTracks: () => [{ stop: vi.fn() }],
        }),
    },
    writable: true,
});

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn();

// Mock Canvas toBlob
HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
    callback(new Blob(['test'], { type: 'image/jpeg' }));
});
