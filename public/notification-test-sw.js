/* Isolated notification-readiness worker. Does not cache, intercept fetch, or schedule tasks. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  // Each empty preview push represents one distinct simulated task. Use a unique
  // notification tag so the three task notifications are not overwritten by iOS.
  event.waitUntil(self.registration.showNotification("夏凱納招待｜鎖屏推播測試", {
    body: "模擬任務到點：" + new Date().toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) + "（非正式服事任務）",
    icon: "/logo.png",
    tag: "shekinah-notification-test-" + self.crypto.randomUUID(),
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
