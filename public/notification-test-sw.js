/* Isolated notification-readiness worker. Does not cache, intercept fetch, or schedule tasks. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  // No push subscriptions or server sends exist in this test phase.
  // If a push is later received, show a visible notification immediately.
  event.waitUntil(self.registration.showNotification("夏凱納招待服事", {
    body: "你有一則服事提醒，請開啟系統查看。",
    icon: "/logo.png",
    tag: "shekinah-notification-test",
    data: { destination: "/notification-test" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/notification-test", self.location.origin);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      try { return new URL(client.url).pathname.startsWith("/notification-test"); }
      catch { return false; }
    });
    if (existing) return existing.focus();
    return self.clients.openWindow(url.href);
  })());
});
