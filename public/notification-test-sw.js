/* Isolated notification-readiness worker. Does not cache, intercept fetch, or schedule tasks. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  // The preview server sends a one-shot empty push; always display a visible notice.
  event.waitUntil(self.registration.showNotification("夏凱納招待｜鎖屏推播測試", {
    body: "這是伺服器發出的背景測試通知，並非正式服事任務。",
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
