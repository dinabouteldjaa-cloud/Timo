// Timo — minimal service worker for Web Push.
//
// This intentionally does NOT implement offline caching, background sync,
// or any other PWA behavior — it exists solely to receive push events and
// display notifications, and to route a tap back into the app.
//
// Timo's router is a HashRouter (see src/App.tsx), so real in-app routes
// look like "/#/tasks", not "/tasks". Notification target URLs sent from
// the push-reminders Edge Function are already in that form — do not
// change them to plain paths, or the tap will fail to open the right
// screen (there is no server-side rewrite for arbitrary paths).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Timo', body: 'You have a reminder.', url: '/' };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = event.notification.data?.url || '/';
  // Resolve to an absolute URL up front so behavior is identical whether
  // we're focusing an existing tab or opening a brand new one.
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // If Timo is already open in a tab, focus it and navigate there.
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Some browsers restrict navigation from here; focusing the
              // existing tab is still a reasonable fallback.
            }
          }
          return;
        }
      }

      // Otherwise open a new window/tab.
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
