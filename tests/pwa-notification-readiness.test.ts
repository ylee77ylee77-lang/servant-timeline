import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (name: string) => fs.readFileSync(path.join(process.cwd(), name), "utf8");

test("test PWA is isolated and does not replace the volunteer home screen", () => {
  const manifest = JSON.parse(read("public/notification-test.webmanifest"));
  const page = read("app/notification-test/page.tsx");
  const client = read("components/notification/NotificationReadinessTest.tsx");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/notification-test");
  assert.equal(manifest.start_url, "/notification-test");
  assert.equal(manifest.scope, "/notification-test");
  assert.match(page, /manifest: "\/notification-test\.webmanifest"/);
  assert.match(page, /capable: true/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(client, /scope: "\/notification-test"/);
  assert.doesNotMatch(read("app/layout.tsx"), /notification-test\.webmanifest/);
  assert.doesNotMatch(read("components/profile/PersonalPreferencesCards.tsx"), /NotificationReadinessTest/);
});

test("permission is requested on user gesture, never on mount", () => {
  const client = read("components/notification/NotificationReadinessTest.tsx");
  const start = client.indexOf("  const runTest = async () => {");
  const end = client.indexOf("\n  return (", start);
  assert.ok(start >= 0 && end > start);
  const action = client.slice(start, end);
  assert.match(action, /isApplePhoneOrTablet\(\) && !openedFromHomeScreen\(\)/);
  assert.match(action, /Notification\.permission === "denied"/);
  assert.match(action, /Notification\.requestPermission\(\)/);
  assert.match(action, /navigator\.serviceWorker\.register/);
  assert.match(action, /registration\.showNotification/);
  assert.ok(action.indexOf("Notification.requestPermission()") < action.indexOf("await navigator.serviceWorker.register("));
  assert.match(client, /onClick=\{\(\) => void runTest\(\)\}/);
  assert.doesNotMatch(client, /useEffect\(|setInterval\(|setTimeout\(/);
});

test("worker always shows push notifications and cannot cache dashboard requests", () => {
  const sw = read("public/notification-test-sw.js");
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /event\.waitUntil\(self\.registration\.showNotification/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.match(sw, /clients\.openWindow/);
  assert.doesNotMatch(sw, /addEventListener\("fetch"|caches\.open|importScripts/);
  assert.doesNotMatch(sw, /phone|service_role|apikey|PRIVATE_KEY/);
});
