'use client';

import { useCallback, useEffect, useState } from 'react';

// Front-end only for now: the "has this adventurer been shown the tour?" flag lives in
// localStorage, keyed per user so two accounts on one device each get their own walkthrough.
// When the backend gains an `onboardingCompletedAt` user preference this hook is the single
// place to swap the persistence for an API call.
const ONBOARDING_STORAGE_KEY_PREFIX = 'pocket_pixel_onboarding_completed';

const storageKey = (userId: string): string => `${ONBOARDING_STORAGE_KEY_PREFIX}:${userId}`;

interface UseOnboardingResult {
  readonly isActive: boolean;
  readonly complete: () => void;
  readonly restart: () => void;
}

export function useOnboarding(userId: string | null): UseOnboardingResult {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      if (!localStorage.getItem(storageKey(userId))) setIsActive(true);
    } catch {
      // Private mode / storage disabled — skip the tour rather than blocking the dashboard.
    }
  }, [userId]);

  const complete = useCallback(() => {
    setIsActive(false);
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), new Date().toISOString());
    } catch {
      // Nothing to do: the tour simply reappears next session.
    }
  }, [userId]);

  const restart = useCallback(() => {
    if (userId) {
      try {
        localStorage.removeItem(storageKey(userId));
      } catch {
        // Ignore — restarting in-memory is enough for this session.
      }
    }
    setIsActive(true);
  }, [userId]);

  return { isActive, complete, restart };
}
