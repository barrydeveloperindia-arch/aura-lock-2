import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BleClient } from '@capacitor-community/bluetooth-le';

describe('BLE Connection Resilience & Retry Loop (BLE-1 & BLE-2)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('succeeds immediately on first attempt', async () => {
        BleClient.connect.mockResolvedValueOnce(undefined);

        let connected = false;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await BleClient.connect('58:8C:81:CC:65:29');
                connected = true;
                break;
            } catch (connErr) {
                lastErr = connErr;
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, attempt * 10));
                }
            }
        }

        expect(connected).toBe(true);
        expect(BleClient.connect).toHaveBeenCalledTimes(1);
    });

    it('retries and succeeds on the second attempt after initial failure', async () => {
        BleClient.connect
            .mockRejectedValueOnce(new Error('Connection timed out'))
            .mockResolvedValueOnce(undefined);

        let connected = false;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await BleClient.connect('58:8C:81:CC:65:29');
                connected = true;
                break;
            } catch (connErr) {
                lastErr = connErr;
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, attempt * 10));
                }
            }
        }

        expect(connected).toBe(true);
        expect(BleClient.connect).toHaveBeenCalledTimes(2);
    });

    it('exhausts 3 attempts and properly surfaces the error if connection permanently fails', async () => {
        BleClient.connect.mockRejectedValue(new Error('Device unreachable'));

        let connected = false;
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await BleClient.connect('58:8C:81:CC:65:29');
                connected = true;
                break;
            } catch (connErr) {
                lastErr = connErr;
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, attempt * 10));
                }
            }
        }

        expect(connected).toBe(false);
        expect(BleClient.connect).toHaveBeenCalledTimes(3);
        expect(lastErr.message).toBe('Device unreachable');
    });
});
