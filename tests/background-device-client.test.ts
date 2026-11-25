import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nextReminderIntent, currentReminderIntent } from "../lib/notifications/background-device-client.ts";

test("switch-off and sign-out invalidate pending authorization", () => {
  const first = nextReminderIntent();
  assert.equal(currentReminderIntent(first), true);
  const second = nextReminderIntent();
  assert.equal(currentReminderIntent(first), false);
  assert.equal(currentReminderIntent(second), true);
});

test("formal root PWA is separate from the test PWA and prompts only on direct user action", () => {
  const manifest = JSON.parse(fs.readFileSync("public/service-app.webmanifest", "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  const client = fs.readFileSync("lib/notifications/background-device-client.ts", "utf8");
  const hook = fs.readFileSync("components/notification/useBackgroundReminders.ts", "utf8");
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const auth = fs.readFileSync("components/auth/AuthProvider.tsx", "utf8");
  assert.match(client, /if \(before && !ourWorker\(before\)\)/);
  assert.match(client, /return prepared\.registration\.pushManager\.subscribe\(/);
  assert.match(client, /if \(!hasReminderConsent\(input\.userId\)\)/);
  assert.match(hook, /const authorize = useCallback\(\(\) =>/);
  assert.match(hook, /request = subscribeFromGesture\(prepared\)/);
  assert.match(page, /backgroundReminder\.onPreferenceChange\(patch\.vibrationReminderEnabled\)/);
  assert.match(page, /serviceType: checkinStatus !== "not_checked_in" && checkInId \? checkedInService : ""/);
  assert.match(auth, /stopBackgroundRemindersOnSignOut\(session\?\.access_token\)/);
  assert.doesNotMatch(client, /localStorage\.setItem\([^,]+,\s*(?:sub|.*endpoint|.*accessToken)/);
  assert.doesNotMatch(hook, /Notification\.requestPermission/);
});
