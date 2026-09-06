import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock @capacitor-community/bluetooth-le
vi.mock('@capacitor-community/bluetooth-le', () => ({
  BleClient: {
    initialize: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockResolvedValue(true),
    getConnectedDevices: vi.fn().mockResolvedValue([]),
    requestLEScan: vi.fn().mockResolvedValue(undefined),
    stopLEScan: vi.fn().mockResolvedValue(undefined),
  }
}));

// Mock @capgo/capacitor-native-biometric
vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: {
    isAvailable: vi.fn().mockResolvedValue({ isAvailable: false }),
    verifyIdentity: vi.fn().mockResolvedValue({}),
  }
}));

// Mock @capacitor/camera
vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: vi.fn().mockResolvedValue({}),
  },
  CameraResultType: {
    Uri: 'Uri',
    Base64: 'Base64',
    DataUrl: 'DataUrl',
  },
  CameraSource: {
    Camera: 'Camera',
    Photos: 'Photos',
    Prompt: 'Prompt',
  }
}));

// Mock @capacitor/filesystem
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({}),
    readFile: vi.fn().mockResolvedValue({}),
    deleteFile: vi.fn().mockResolvedValue({}),
    mkdir: vi.fn().mockResolvedValue({}),
  },
  Directory: {
    Documents: 'Documents',
    Data: 'Data',
    Cache: 'Cache',
    External: 'External',
    ExternalStorage: 'ExternalStorage',
  }
}));

// Mock @capacitor/share
vi.mock('@capacitor/share', () => ({
  Share: {
    share: vi.fn().mockResolvedValue({}),
  }
}));

// Mock @capacitor/core
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn().mockReturnValue(false),
    getPlatform: vi.fn().mockReturnValue('web'),
  }
}));

// Mock LocalFaceService (singleton) — prevents TerminalHome from importing real face-api.js/idb
vi.mock('../LocalFaceService', () => ({
  localFaceService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    syncDescriptors: vi.fn().mockResolvedValue(undefined),
    matchFace: vi.fn().mockResolvedValue({ matched: false }),
    enrollFace: vi.fn().mockResolvedValue(null),
    getStatus: vi.fn().mockReturnValue({ modelsLoaded: false, descriptorCount: 0, lastSync: null }),
    storeDescriptors: vi.fn().mockResolvedValue(undefined),
  },
  LocalFaceService: vi.fn(),
}));
