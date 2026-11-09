/* RMW CRM service worker: web push notifications only (no offline caching). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'RMW CRM', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'RMW CRM', {
    body: data.body || '',
    tag: data.tag || undefined,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: data.url || '/crm/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/crm/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.startsWith(self.location.origin));
    if (existing) { await existing.focus(); return existing.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
