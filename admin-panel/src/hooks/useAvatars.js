import { useEffect, useState } from 'react';
import { apiService } from '../services/api';

/**
 * Signed avatar URLs for a list of employee ids, fetched in one request and
 * cached in-memory for the life of the tab. Signed links last 1 hour; the
 * cache is dropped after 50 minutes so a long-open dashboard never shows a
 * broken image.
 *
 *   const avatars = useAvatars(rows.map(r => r.employees?.employee_id));
 *   <img src={avatars['EMP-012']} />
 */
const cache = { fetchedAt: 0, urls: {} };
const CACHE_MS = 50 * 60 * 1000;

export default function useAvatars(employeeIds) {
    const key = [...new Set((employeeIds || []).filter(Boolean))].sort().join(',');
    const [urls, setUrls] = useState(() => (Date.now() - cache.fetchedAt < CACHE_MS ? cache.urls : {}));

    useEffect(() => {
        if (!key) return;
        const ids = key.split(',');
        const fresh = Date.now() - cache.fetchedAt < CACHE_MS;
        const missing = ids.filter(id => !(id in cache.urls));
        if (fresh && missing.length === 0) return;

        let cancelled = false;
        apiService.getAvatars(fresh ? missing : ids)
            .then(({ avatars }) => {
                if (cancelled) return;
                // Remember misses too (as null) so we don't re-ask for staff without a photo yet
                const next = fresh ? { ...cache.urls } : {};
                for (const id of (fresh ? missing : ids)) next[id] = avatars?.[id] || null;
                cache.urls = next;
                cache.fetchedAt = Date.now();
                setUrls(next);
            })
            .catch(() => { /* avatars are decoration; initials remain */ });
        return () => { cancelled = true; };
    }, [key]);

    return urls;
}
