/**
 * LocalFaceService — On-device face recognition using face-api.js + IndexedDB
 *
 * Architecture:
 *   1. Models loaded from bundled assets (/models/)
 *   2. Face descriptors synced from backend → IndexedDB
 *   3. matchFace() runs entirely on-device (~200-400ms)
 *   4. Cloud edge service is fallback only
 *
 * Confidence Tiers:
 *   distance < 0.45  → HIGH   → instant unlock
 *   distance 0.45–0.55 → MEDIUM → unlock, flag for review
 *   distance 0.55–0.6  → LOW    → skip local, use cloud
 *   distance > 0.6    → NONE   → no match
 *
 * IMPORTANT: face-api.js is loaded LAZILY via dynamic import() to prevent
 * TensorFlow.js WebGL backend initialization from crashing the main app
 * on Android WebViews that don't support it.
 */

const DB_NAME = 'auralock-faces';
const STORE_NAME = 'descriptors';
const DB_VERSION = 1;
const MATCH_THRESHOLD = 0.6;

// Lazy-loaded references (populated in initialize())
let faceapi = null;
let openDB = null;

class LocalFaceService {
    constructor() {
        this._modelsLoaded = false;
        this._descriptorCount = 0;
        this._lastSync = null;
        this._db = null;
    }

    /**
     * Load face-api.js models from bundled assets.
     * Uses dynamic import() so TensorFlow.js can't crash the main bundle.
     * Call once on app startup.
     */
    async initialize(modelPath = '/models') {
        try {
            // Dynamic imports — isolate any TF.js initialization errors
            if (!faceapi) {
                const faceapiModule = await import('face-api.js');
                faceapi = faceapiModule;
            }
            if (!openDB) {
                const idbModule = await import('idb');
                openDB = idbModule.openDB;
            }

            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
            ]);
            this._modelsLoaded = true;
            this._db = await openDB(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'employee_id' });
                    }
                },
            });
            // Load cached descriptor count
            const all = await this._db.getAll(STORE_NAME);
            this._descriptorCount = all.length;
        } catch (_err) {
            this._modelsLoaded = false;
        }
    }

    /**
     * Sync face descriptors from backend to IndexedDB.
     * @param {string} apiBase - Backend API base URL
     */
    async syncDescriptors(apiBase) {
        try {
            const res = await fetch(`${apiBase}/api/biometrics/face/descriptors`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.descriptors && data.descriptors.length > 0) {
                await this.storeDescriptors(data.descriptors);
            }
            this._lastSync = new Date();
        } catch (_err) {
            // Silent fail — offline or backend unavailable
        }
    }

    /**
     * Store descriptors into IndexedDB.
     * @param {Array<{employee_id: string, name: string, descriptor: number[]}>} descriptors
     */
    async storeDescriptors(descriptors) {
        try {
            if (!openDB) {
                const idbModule = await import('idb');
                openDB = idbModule.openDB;
            }
            if (!this._db) {
                this._db = await openDB(DB_NAME, DB_VERSION, {
                    upgrade(db) {
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME, { keyPath: 'employee_id' });
                        }
                    },
                });
            }
            const tx = this._db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            // Delta sync: delete local descriptors that are no longer in the synced list
            const localKeys = await store.getAllKeys();
            const incomingIds = descriptors.map(d => d.employee_id);
            for (const key of localKeys) {
                if (!incomingIds.includes(key)) {
                    await store.delete(key);
                }
            }

            for (const d of descriptors) {
                await store.put({
                    employee_id: d.employee_id,
                    name: d.name,
                    descriptor: d.descriptor,
                    updated_at: d.updated_at || new Date().toISOString(),
                });
            }
            await tx.done;

            const all = await this._db.getAll(STORE_NAME);
            this._descriptorCount = all.length;
        } catch (_err) {
            // Silent fail — IndexedDB might not be available
        }
    }

    /**
     * Detect face in video element and match against stored descriptors.
     * Returns match result with confidence tier.
     *
     * @param {HTMLVideoElement} videoElement
     * @returns {Promise<{matched: boolean, employee?: object, distance?: number, confidence?: string}>}
     */
    async matchFace(videoElement) {
        if (!this._modelsLoaded || !this._db || !faceapi) {
            return { matched: false };
        }

        try {
            // Detect face + extract 128D descriptor
            const detection = await faceapi
                .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) {
                return { matched: false };
            }

            const queryDescriptor = detection.descriptor;

            // Get all stored descriptors from IndexedDB
            const stored = await this._db.getAll(STORE_NAME);
            if (stored.length === 0) {
                return { matched: false };
            }

            // Find closest match using Euclidean distance
            let bestMatch = null;
            let bestDistance = Infinity;

            for (const entry of stored) {
                const storedArr = new Float32Array(entry.descriptor);
                const distance = this._euclideanDistance(queryDescriptor, storedArr);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMatch = entry;
                }
            }

            // Apply threshold
            if (bestDistance >= MATCH_THRESHOLD) {
                return { matched: false };
            }

            // Determine confidence tier
            let confidence;
            if (bestDistance < 0.45) {
                confidence = 'high';
            } else if (bestDistance < 0.55) {
                confidence = 'medium';
            } else {
                confidence = 'low';
            }

            return {
                matched: true,
                employee: {
                    employee_id: bestMatch.employee_id,
                    name: bestMatch.name,
                },
                distance: bestDistance,
                confidence,
            };
        } catch (_err) {
            return { matched: false };
        }
    }

    /**
     * Generate a face-api.js descriptor from a video element for enrollment.
     * @param {HTMLVideoElement} videoElement
     * @param {{employee_id: string, name: string}} employee
     * @returns {Promise<Float32Array|null>}
     */
    async enrollFace(videoElement, employee) {
        if (!this._modelsLoaded || !faceapi) return null;

        try {
            const detection = await faceapi
                .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceDescriptor();

            if (!detection) return null;

            const descriptor = Array.from(detection.descriptor);
            await this.storeDescriptors([{
                employee_id: employee.employee_id || employee.id,
                name: employee.name,
                descriptor,
            }]);

            return detection.descriptor;
        } catch (_err) {
            return null;
        }
    }

    /**
     * @returns {{modelsLoaded: boolean, descriptorCount: number, lastSync: Date|null}}
     */
    getStatus() {
        return {
            modelsLoaded: this._modelsLoaded,
            descriptorCount: this._descriptorCount,
            lastSync: this._lastSync,
        };
    }

    /**
     * Euclidean distance between two Float32Arrays.
     * @param {Float32Array} a
     * @param {Float32Array} b
     * @returns {number}
     */
    _euclideanDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }
}

// Singleton export for app-wide use
const localFaceService = new LocalFaceService();

export { LocalFaceService, localFaceService };
