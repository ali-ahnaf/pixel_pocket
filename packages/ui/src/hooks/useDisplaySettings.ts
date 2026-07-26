'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserPreferenceDto } from '@expense-tracker/shared';
import { profileApi } from '@/lib/api';
import { useAuth } from './useAuth';

const SETTINGS_EVENT = 'pocket_pixel_display_settings';

export interface DisplaySettings {
  showIncome: boolean;
  showExpense: boolean;
  aiTransactionEntryEnabled: boolean;
}

const DEFAULT_SETTINGS: DisplaySettings = { showIncome: false, showExpense: false, aiTransactionEntryEnabled: false };

// Module-level cache so components mounted after the first fetch render the
// last-known settings immediately instead of flashing the defaults.
let currentSettings: DisplaySettings = DEFAULT_SETTINGS;
// Consumers that branch on a setting (not just mask a value) need to know
// whether `currentSettings` is still the defaults or a real server response.
let settingsLoaded = false;

const broadcast = (settings: DisplaySettings): void => {
  currentSettings = settings;
  settingsLoaded = true;
  // Notify every hook instance in this tab (React state isn't shared across them).
  window.dispatchEvent(new Event(SETTINGS_EVENT));
};

interface UseDisplaySettingsResult extends DisplaySettings {
  setShowIncome: (value: boolean) => void;
  setShowExpense: (value: boolean) => void;
  setAiTransactionEntryEnabled: (value: boolean) => void;
  loaded: boolean;
}

export const useDisplaySettings = (): UseDisplaySettingsResult => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [settings, setSettings] = useState<DisplaySettings>(currentSettings);
  const [loaded, setLoaded] = useState<boolean>(settingsLoaded);

  useEffect(() => {
    const sync = (): void => {
      setSettings(currentSettings);
      setLoaded(settingsLoaded);
    };
    window.addEventListener(SETTINGS_EVENT, sync);
    return () => window.removeEventListener(SETTINGS_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    profileApi
      .getPreferences(userId)
      .then((prefs: UserPreferenceDto) => {
        if (!cancelled) broadcast({ showIncome: prefs.showIncome, showExpense: prefs.showExpense, aiTransactionEntryEnabled: prefs.aiTransactionEntryEnabled });
      })
      // Offline the request never lands. Consumers that branch on `loaded` (the
      // log-transaction modal renders no form at all until it flips) would stay
      // blocked forever, so settle on the last known settings instead.
      .catch(() => {
        if (!cancelled) broadcast(currentSettings);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persist = useCallback(
    (next: DisplaySettings): void => {
      // Optimistic: update the UI immediately, then persist to the API.
      broadcast(next);
      if (!userId) return;
      profileApi.updatePreferences(userId, next).catch(() => undefined);
    },
    [userId],
  );

  const setShowIncome = useCallback((value: boolean): void => persist({ ...currentSettings, showIncome: value }), [persist]);
  const setShowExpense = useCallback((value: boolean): void => persist({ ...currentSettings, showExpense: value }), [persist]);
  const setAiTransactionEntryEnabled = useCallback((value: boolean): void => persist({ ...currentSettings, aiTransactionEntryEnabled: value }), [persist]);

  return { ...settings, setShowIncome, setShowExpense, setAiTransactionEntryEnabled, loaded };
};
