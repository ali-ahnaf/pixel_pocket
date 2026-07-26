// Minimal service worker for Pocket Pixel.
// Its main job is to satisfy Android/Chrome's installability requirement
// (a fetch handler) while providing a lightweight offline experience.
//
// Strategy:
//   - Navigations: network-first, fall back to the cached shell when offline.
//   - Static assets (icons, splash, fonts, JS/CSS): cache-first.
// Bump CACHE_VERSION whenever you want clients to drop the old cache.

const CACHE_VERSION = 'v4';
const CACHE_NAME = `pocket-pixel-${CACHE_VERSION}`;

// Pre-cache the app shell + core PWA assets so a cold offline launch works.
// The route shells need their trailing slash (next.config.js sets trailingSlash:
// true); without '/debts/' a cold offline launch into that route falls back to
// the '/' shell and renders the wrong page.
const PRECACHE_URLS = ['/', '/debts/', '/manifest.json', '/logo192.png', '/logo512.png', '/pwa-assets/manifest-icon-192.maskable.png', '/pwa-assets/manifest-icon-512.maskable.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll is atomic; tolerate individual misses so install never fails.
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET; let the browser deal with POST/PUT/etc.
  if (request.method !== 'GET') return;

  // Don't intercept API traffic — always hit the network.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;

  // Network-first for page navigations, cached shell as offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Cache-first for everything else (static assets).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

// Web Push: a bank-alert transaction created from a Gmail watcher notifies the
// browser even when the tab is closed. Payload shape is PushNotificationPayload
// (packages/shared/src/contracts/push-subscriptions.ts): { title, body, url? }.
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/pwa-assets/manifest-icon-192.maskable.png',
      badge: '/pwa-assets/manifest-icon-192.maskable.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
