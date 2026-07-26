'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { profileApi } from '@/lib/api';

interface UseOnboardingResult {
  readonly isActive: boolean;
  readonly complete: () => void;
  readonly restart: () => void;
}

/**
 * Drives the first-run walkthrough off the `hasOnboarded` flag on the user record,
 * so the tour is shown once per account rather than once per browser.
 *
 * `hasOnboarded` is `undefined` while the profile is still loading; the tour only
 * opens once it resolves to `false`. The decision is taken a single time per user
 * so a later profile refetch (month change, transaction save) cannot reopen a tour
 * the adventurer has already dismissed.
 */
export function useOnboarding(userId: string | null, hasOnboarded: boolean | undefined): UseOnboardingResult {
  const [isActive, setIsActive] = useState(false);
  const decidedForUser = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || hasOnboarded === undefined) return;
    if (decidedForUser.current === userId) return;
    decidedForUser.current = userId;
    if (!hasOnboarded) setIsActive(true);
  }, [userId, hasOnboarded]);

  const persist = useCallback(
    (value: boolean) => {
      if (!userId) return;
      profileApi.updateUser(userId, { hasOnboarded: value }).catch(() => {
        // Nothing to do: the tour simply reappears on the next load.
      });
    },
    [userId],
  );

  const complete = useCallback(() => {
    setIsActive(false);
    persist(true);
  }, [persist]);

  const restart = useCallback(() => {
    setIsActive(true);
    persist(false);
  }, [persist]);

  return { isActive, complete, restart };
}
