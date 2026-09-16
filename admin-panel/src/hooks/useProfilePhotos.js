import { useEffect, useState } from 'react';
import { apiService } from '../services/api';

/**
 * Signed URLs for deliberately-uploaded ID-card photos (separate from the biometric-scan
 * avatar), same caching shape as useAvatars.
 *
 *   const photos = useProfilePhotos(rows.map(r => r.employee_id));
 *   <img src={photos['EL024']} />
 */
const cache = { fetchedAt: 0, urls: {} };
const CACHE_MS = 50 * 60 * 1000;

export default function useProfilePhotos(employeeIds) {
    const key = [...new Set((employeeIds || []).filter(Boolean))].sort().join(',');
    const [urls, setUrls] = useState(() => (Date.now() - cache.fetchedAt < CACHE_MS ? cache.urls : {}));

    useEffect(() => {
        if (!key) return;
        const ids = key.split(',');
        const fresh = Date.now() - cache.fetchedAt < CACHE_MS;
        const missing = ids.filter(id => !(id in cache.urls));
        if (fresh && missing.length === 0) return;

        let cancelled = false;
        apiService.getProfilePhotos(fresh ? missing : ids)
            .then(({ photos }) => {
                if (cancelled) return;
                const next = fresh ? { ...cache.urls } : {};
                for (const id of (fresh ? missing : ids)) next[id] = photos?.[id] || null;
                cache.urls = next;
                cache.fetchedAt = fresh && cache.fetchedAt ? cache.fetchedAt : Date.now();
                setUrls(next);
            })
            .catch(() => { /* profile photos are optional; fall back to the avatar */ });
        return () => { cancelled = true; };
    }, [key]);

    return urls;
}

/** Call after a successful upload so the new photo shows immediately, without waiting for the cache to expire. */
export function invalidateProfilePhoto(employeeId) {
    delete cache.urls[employeeId];
}
