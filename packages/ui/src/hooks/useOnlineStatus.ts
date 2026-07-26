'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity. Seeded to `true` and corrected in an effect so
 * the server-rendered markup and the first client render always agree (the
 * static export would otherwise hydrate-mismatch when launched offline).
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return isOnline;
}
