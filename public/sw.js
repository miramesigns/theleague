/* global self, clients */

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = { title: 'MFL League Companion', body: '', href: '/scores', tag: 'mfl' };
  try {
    payload = event.data.json();
  } catch {
    // fallback to plain text
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: payload.tag || 'mfl',
      data: { href: payload.href || '/scores' },
      requireInteraction: false,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href || '/scores';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(href) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(href);
        }
      }),
  );
});
