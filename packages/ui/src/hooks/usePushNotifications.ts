'use client';

import { useCallback, useEffect, useState } from 'react';
import { profileApi } from '@/lib/api';
import { useAuth } from './useAuth';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

interface UsePushNotificationsResult {
  /** False when the browser lacks Notification/PushManager support (e.g. iOS Safari outside a home-screen PWA). */
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

export const usePushNotifications = (): UsePushNotificationsResult => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    setSupported(true);

    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setSubscribed(!!subscription);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (): Promise<void> => {
    if (!userId || !supported) return;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
      const json = subscription.toJSON();

      await profileApi.subscribePush(userId, { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } });
      setSubscribed(true);
    } finally {
      setLoading(false);
    }
  }, [userId, supported]);

  const disable = useCallback(async (): Promise<void> => {
    if (!userId || !supported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await profileApi.unsubscribePush(userId, subscription.endpoint);
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [userId, supported]);

  return { supported, subscribed, loading, enable, disable };
};
