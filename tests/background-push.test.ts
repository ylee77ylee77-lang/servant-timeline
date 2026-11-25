import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import { isApplePushEndpoint, parseAppleSubscription, makeReminderPayload, sendBackgroundPush, validDispatcherAuthorization, validVapidKeys } from "../lib/notifications/background-push.ts";
import { dispatchBackgroundReminders, type Taken } from "../lib/notifications/dispatch-reminders.ts";

const pair = () => {
  const ec = createECDH("prime256v1"); ec.generateKeys();
  // Node's ECDH can return a minimal-length scalar. VAPID always needs 32 bytes.
  const raw = ec.getPrivateKey();
  const fixed = Buffer.concat([Buffer.alloc(32 - raw.length), raw]);
  return { publicKey: ec.getPublicKey(undefined, "uncompressed").toString("base64url"), privateKey: fixed.toString("base64url") };
};
const subscription = {
  endpoint: "https://web.push.apple.com/fixture-test",
  keys: { p256dh: pair().publicKey, auth: randomBytes(16).toString("base64url") },
};
const keys = { ...pair(), subject: "https://example.invalid" };
const cue: Taken = {
  delivery_id: "11111111-1111-4111-8111-111111111111",
  service_date: "2030-01-06", service_type: "主一堂", task_time: "09:30",
  scheduled_at: "2030-01-06T01:30:00.000Z",
  endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth_secret: subscription.keys.auth,
};
const due = Date.parse(cue.scheduled_at);

test("Apple subscription accepts only canonical endpoint and valid P-256/auth keys", () => {
  assert.deepEqual(parseAppleSubscription(subscription), subscription);
  for (const endpoint of ["https://web.push.apple.com.evil.invalid/x", "https://127.0.0.1/x", "https://web.push.apple.com/x?y=1", "https://web.push.apple.com:443/x", "https://u@web.push.apple.com/x"]) {
    assert.equal(isApplePushEndpoint(endpoint), false);
  }
  assert.equal(parseAppleSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: "A".repeat(87) } }), null);
  assert.equal(parseAppleSubscription({ ...subscription, keys: { ...subscription.keys, auth: "B".repeat(22) } }), null);
  assert.equal(validVapidKeys(keys), true);
  assert.equal(validVapidKeys({ ...keys, privateKey: pair().privateKey }), false);
});

test("VAPID accepts a canonical 32-byte scalar with leading zeroes", () => {
  const ec = createECDH("prime256v1");
  const scalar = Buffer.alloc(32);
  scalar[31] = 1;
  ec.setPrivateKey(scalar);
  const fixed = { subject: "https://example.invalid", publicKey: ec.getPublicKey(undefined, "uncompressed").toString("base64url"), privateKey: scalar.toString("base64url") };
  assert.equal(validVapidKeys(fixed), true);
  assert.equal(validVapidKeys({ ...fixed, privateKey: Buffer.from([1]).toString("base64url") }), false);
});

test("encrypted payload is bounded to service/date/time and never sends clear text or redirects", async () => {
  const payload = JSON.parse(makeReminderPayload(cue));
  assert.deepEqual(payload, { kind: "service-task-reminder", id: cue.delivery_id, date: cue.service_date, service: cue.service_type, time: cue.task_time });
  let calls = 0;
  const result = await sendBackgroundPush(subscription, cue, keys, async (url, init) => {
    calls++;
    assert.equal(url, subscription.endpoint);
    assert.equal(init?.redirect, "error");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-encoding"), "aes128gcm");
    assert.equal(headers.get("urgency"), "high");
    assert.equal(headers.get("ttl"), "15");
    assert.match(headers.get("authorization") ?? "", /^vapid /);
    const bytes = Buffer.from(init?.body as Uint8Array);
    assert.ok(bytes.length > 80);
    assert.ok(!bytes.includes(Buffer.from("主一堂")));
    return new Response(null, { status: 201 });
  }, () => due + 3_000);
  assert.equal(result.status, 201);
  assert.equal(calls, 1);
  await assert.rejects(sendBackgroundPush(subscription, cue, keys, async () => {
    throw new Error("must not send stale event");
  }, () => due + 21_000), /Expired/);
});

test("dispatcher rechecks each claim, deduplicates, and never retries uncertain delivery", async () => {
  const ids = ["accepted", "rejected", "uncertain", "cancelled"];
  const finished: Array<[string, string, number | null]> = [];
  const attempted: string[] = [];
  const counts = await dispatchBackgroundReminders({
    claim: async () => [...ids, "accepted"].map(delivery_id => ({ delivery_id })),
    take: async id => id === "cancelled" ? null : { ...cue, delivery_id: id },
    finish: async (id, state, status) => { finished.push([id, state, status]); return true; },
  }, async (_subscription, task) => {
    attempted.push(task.delivery_id);
    if (task.delivery_id === "uncertain") throw new Error("transport timeout");
    return { status: task.delivery_id === "accepted" ? 201 : 410 };
  });
  assert.deepEqual(attempted.sort(), ["accepted","rejected","uncertain"]);
  assert.deepEqual(finished.sort(), [["accepted","accepted",201],["rejected","rejected",410],["uncertain","uncertain",null]]);
  assert.deepEqual(counts, { claimed: 5, skipped: 2, accepted: 1, rejected: 1, uncertain: 1, errors: 0 });
});

test("short-lived dispatch signature fails closed and routes do not take user-controlled IDs or clock", () => {
  const secret = "s".repeat(40);
  const ts = Math.floor(due / 1000);
  const sign = (timestamp: number) => "Bearer v1." + timestamp + "." +
    createHmac("sha256", secret).update("background-reminders:dispatch:v1:" + timestamp).digest("hex");
  const token = sign(ts);
  assert.equal(validDispatcherAuthorization(token, secret, () => due), true);
  assert.equal(validDispatcherAuthorization(token, secret, () => due + 30_000), true);
  assert.equal(validDispatcherAuthorization(token, secret, () => due + 31_000), false);
  assert.equal(validDispatcherAuthorization(sign(ts + 6), secret, () => due), false);
  assert.equal(validDispatcherAuthorization(token.slice(0, -1), secret, () => due), false);
  assert.equal(validDispatcherAuthorization(token, "x".repeat(40), () => due), false);
  assert.equal(validDispatcherAuthorization(token, "", () => due), false);
  assert.equal(validDispatcherAuthorization("Bearer " + secret, secret, () => due), false);
  const device = fs.readFileSync("app/api/background-reminders/device/route.ts", "utf8");
  const route = fs.readFileSync("app/api/background-reminders/dispatch/route.ts", "utf8");
  const config = fs.readFileSync("lib/notifications/background-config.ts", "utf8");
  assert.match(device, /p_user_id: user\.userId/);
  assert.match(device, /p_session_id: sessionId/);
  assert.match(device, /requireActiveUser\(request\)/);
  assert.match(device, /request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.doesNotMatch(device, /p_at:|body\.userId|body\.assignmentId|body\.checkInId/);
  assert.match(route, /validDispatcherAuthorization/);
  assert.doesNotMatch(route, /request\.json|request\.text|p_at:/);
  assert.match(config, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(config, /ENABLE_BACKGROUND_TASK_REMINDERS !== "true"/);
});
