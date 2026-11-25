// Kalender service worker (S10). Shows Reminder push notifications and opens Kalender when one is tapped.
// It caches nothing (S10 decision 7): no Event data is kept in the browser, and a new deploy is never hidden behind an old cache.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {}; // not JSON: show the generic text
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Kalender Reminder', {
      body: data.body || 'Open Kalender to see your Reminder.',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(url);
      }
      return self.clients.openWindow(url);
    })(),
  );
});
