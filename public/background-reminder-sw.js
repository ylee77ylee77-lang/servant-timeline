/* The formal worker only handles visible task alerts. No request caching. */
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { payload = null; }
    // Web Push on iOS requires a visible notification. A malformed or stale
    // payload can still show a generic alert, never untrusted arbitrary text.
    const preview = payload?.kind === "service-task-reminder-preview";
    const valid = payload && (payload.kind === "service-task-reminder" || preview)
      && /^[0-9a-f-]{36}$/i.test(payload.id)
      && ["六晚崇", "主一堂", "主二堂"].includes(payload.service)
      && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.time);
    await self.registration.showNotification(preview ? "夏凱納招待｜測試任務" : "夏凱納招待｜任務提醒", {
      body: valid ? payload.date + " " + payload.service + " " + payload.time + " 任務到點" + (preview ? "（模擬，非正式服事）" : "") : "請回到招待服事系統確認目前任務。",
      icon: "/logo.png",
      tag: valid ? "shekinah-task-" + payload.id : "shekinah-task-reminder",
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL("/", self.location.origin);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => {
      try { return new URL(client.url).origin === url.origin && new URL(client.url).pathname === "/"; }
      catch { return false; }
    });
    if (existing) return existing.focus();
    return self.clients.openWindow(url.href);
  })());
});
