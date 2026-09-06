import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unmock LocalFaceService for this test — we're testing the REAL implementation
vi.unmock('../LocalFaceService');
vi.unmock('./LocalFaceService');
vi.unmock('../src/LocalFaceService');

// Mock face-api.js before importing the service
vi.mock('face-api.js', () => {
    const detectSingleFace = vi.fn();
    const withFaceLandmarks = vi.fn();
    const withFaceDescriptor = vi.fn();

    // Chainable mock: detectSingleFace().withFaceLandmarks().withFaceDescriptor()
    withFaceDescriptor.mockResolvedValue({
        descriptor: new Float32Array(128).fill(0.1),
    });
    withFaceLandmarks.mockReturnValue({ withFaceDescriptor });
    detectSingleFace.mockReturnValue({ withFaceLandmarks });

    return {
        nets: {
            tinyFaceDetector: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
            faceLandmark68TinyNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
            faceRecognitionNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
        },
        TinyFaceDetectorOptions: vi.fn(),
        detectSingleFace,
        // Expose inner mocks for test manipulation
        _mocks: { detectSingleFace, withFaceLandmarks, withFaceDescriptor },
    };
});

// Mock idb (IndexedDB wrapper)
const mockStore = new Map();
vi.mock('idb', () => ({
    openDB: vi.fn().mockResolvedValue({
        getAll: vi.fn().mockImplementation(() => Promise.resolve([...mockStore.values()])),
        put: vi.fn().mockImplementation((storeName, value) => {
            mockStore.set(value.employee_id, value);
            return Promise.resolve();
        }),
        clear: vi.fn().mockImplementation(() => {
            mockStore.clear();
            return Promise.resolve();
        }),
        transaction: vi.fn().mockReturnValue({
            objectStore: vi.fn().mockReturnValue({
                put: vi.fn().mockImplementation((value) => {
                    mockStore.set(value.employee_id, value);
                    return Promise.resolve();
                }),
                getAllKeys: vi.fn().mockImplementation(() => {
                    return Promise.resolve(Array.from(mockStore.keys()));
                }),
                delete: vi.fn().mockImplementation((key) => {
                    mockStore.delete(key);
                    return Promise.resolve();
                }),
            }),
            done: Promise.resolve(),
        }),
    }),
}));

// Import the service under test AFTER mocks are defined
import { LocalFaceService } from './LocalFaceService';

describe('LocalFaceService', () => {
    let service;

    beforeEach(() => {
        mockStore.clear();
        service = new LocalFaceService();
    });

    // ── Initialization ────────────────────────────────────────────────────────

    describe('initialize()', () => {
        it('loads all three face-api.js models', async () => {
            const faceapi = await import('face-api.js');
            await service.initialize();

            expect(faceapi.nets.tinyFaceDetector.loadFromUri).toHaveBeenCalled();
            expect(faceapi.nets.faceLandmark68TinyNet.loadFromUri).toHaveBeenCalled();
            expect(faceapi.nets.faceRecognitionNet.loadFromUri).toHaveBeenCalled();
        });

        it('sets modelsLoaded to true after successful init', async () => {
            await service.initialize();
            expect(service.getStatus().modelsLoaded).toBe(true);
        });

        it('sets modelsLoaded to false if loading fails', async () => {
            const faceapi = await import('face-api.js');
            faceapi.nets.tinyFaceDetector.loadFromUri.mockRejectedValueOnce(new Error('Load fail'));
            await service.initialize();
            expect(service.getStatus().modelsLoaded).toBe(false);
        });
    });

    // ── Descriptor Management ─────────────────────────────────────────────────

    describe('descriptor storage', () => {
        it('stores descriptors in IndexedDB', async () => {
            await service.initialize();
            const descriptors = [
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
                { employee_id: 'EMP-002', name: 'Raj', descriptor: Array(128).fill(0.3) },
            ];
            await service.storeDescriptors(descriptors);
            expect(service.getStatus().descriptorCount).toBe(2);
        });

        it('reports descriptor count via getStatus()', async () => {
            await service.initialize();
            expect(service.getStatus().descriptorCount).toBe(0);
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Test', descriptor: Array(128).fill(0.5) },
            ]);
            expect(service.getStatus().descriptorCount).toBe(1);
        });

        it('purges old descriptors that are not in the synced incoming list', async () => {
            await service.initialize();
            
            // First store two descriptors
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
                { employee_id: 'EMP-002', name: 'Raj', descriptor: Array(128).fill(0.3) },
            ]);
            expect(service.getStatus().descriptorCount).toBe(2);

            // Now sync with only one descriptor (EMP-002 is deleted)
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
            ]);

            expect(service.getStatus().descriptorCount).toBe(1);
            
            // Check that EMP-002 was actually deleted
            const fakeVideoEl = { videoWidth: 640, videoHeight: 480 };
            
            // Mock face-api to return Raj's descriptor (0.3)
            const faceapi = await import('face-api.js');
            faceapi._mocks.withFaceDescriptor.mockResolvedValueOnce({
                descriptor: new Float32Array(128).fill(0.3),
            });
            
            const result = await service.matchFace(fakeVideoEl);
            // It should not match because Raj was purged
            expect(result.matched).toBe(false);
        });
    });

    // ── Face Matching ─────────────────────────────────────────────────────────

    describe('matchFace()', () => {
        const fakeVideoEl = { videoWidth: 640, videoHeight: 480 };

        it('returns matched=true when a face matches a stored descriptor', async () => {
            await service.initialize();

            // Store a descriptor with the same values the mock returns (all 0.1)
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
            ]);

            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(true);
            expect(result.employee.name).toBe('Sam');
            expect(result.employee.employee_id).toBe('EMP-001');
            expect(result.distance).toBeLessThan(0.6);
        });

        it('returns matched=false when no descriptors are stored', async () => {
            await service.initialize();
            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(false);
        });

        it('returns matched=false when face descriptor is too far from stored descriptors', async () => {
            await service.initialize();

            // Store a descriptor that's very different from what the mock returns (all 0.1)
            await service.storeDescriptors([
                { employee_id: 'EMP-999', name: 'Stranger', descriptor: Array(128).fill(0.9) },
            ]);

            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(false);
        });

        it('returns matched=false when no face is detected in the frame', async () => {
            const faceapi = await import('face-api.js');
            // Make face detection return null (no face found)
            faceapi._mocks.withFaceDescriptor.mockResolvedValueOnce(null);

            await service.initialize();
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
            ]);

            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(false);
        });

        it('returns the closest match when multiple descriptors are stored', async () => {
            await service.initialize();

            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
                { employee_id: 'EMP-002', name: 'Raj', descriptor: Array(128).fill(0.5) },
            ]);

            // Mock returns descriptor with all 0.1 — should match Sam, not Raj
            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(true);
            expect(result.employee.name).toBe('Sam');
        });
    });

    // ── Confidence Tiers ──────────────────────────────────────────────────────

    describe('confidence tiers', () => {
        const fakeVideoEl = { videoWidth: 640, videoHeight: 480 };

        it('returns confidence="high" when distance < 0.45', async () => {
            await service.initialize();
            // Exact match → distance = 0
            await service.storeDescriptors([
                { employee_id: 'EMP-001', name: 'Sam', descriptor: Array(128).fill(0.1) },
            ]);
            const result = await service.matchFace(fakeVideoEl);
            expect(result.matched).toBe(true);
            expect(result.confidence).toBe('high');
        });
    });

    // ── getStatus ─────────────────────────────────────────────────────────────

    describe('getStatus()', () => {
        it('returns initial status before initialization', () => {
            const status = service.getStatus();
            expect(status.modelsLoaded).toBe(false);
            expect(status.descriptorCount).toBe(0);
            expect(status.lastSync).toBe(null);
        });
    });
});
