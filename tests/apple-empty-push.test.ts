import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, createPublicKey, verify } from "node:crypto";
import fs from "node:fs";
import { buildVapidAuthorization, isApplePushEndpoint, sendEmptyApplePush } from "../lib/notifications/apple-empty-push.ts";

const endpoint = "https://web.push.apple.com/Q1c2d3e4f5g6";
const ec = createECDH("prime256v1");
ec.generateKeys();
const keys = {
  publicKey: ec.getPublicKey(undefined, "uncompressed").toString("base64url"),
  privateKey: ec.getPrivateKey().toString("base64url"),
  subject: "https://servant-timeline.vercel.app",
};

test("the Apple push endpoint allowlist excludes SSRF targets and redirects", () => {
  assert.equal(isApplePushEndpoint(endpoint), true);
  for (const malicious of [
    "http://web.push.apple.com/Q", "https://web.push.apple.com.evil.org/Q",
    "https://127.0.0.1/admin", "https://169.254.169.254/metadata",
    "https://evil.com/Q", "file:///tmp/Q", "https://web.push.apple.com/",
    "https://user:pass@web.push.apple.com/Q",
    "https://web.push.apple.com/Q?other=1", "https://sub.push.apple.com/Q",
    "https://web.push.apple.com/Q#fragment", "https://web.push.apple.com/other/Q",
  ]) assert.equal(isApplePushEndpoint(malicious), false, malicious);
});

test("RFC 8292 VAPID token is signed using ES256 with matching subscription audience", () => {
  const auth = buildVapidAuthorization(endpoint, keys, 1770000000000);
  assert.match(auth, /^vapid t=[A-Za-z0-9_.-]+, k=[A-Za-z0-9_-]+$/);
  const token = auth.slice("vapid t=".length).split(", k=")[0];
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  assert.deepEqual(JSON.parse(Buffer.from(parts[0], "base64url").toString()), { typ: "JWT", alg: "ES256" });
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, keys.subject);
  assert.equal(claims.exp, 1770000000 + 3600);
  const pub = ec.getPublicKey(undefined, "uncompressed");
  const verifyingKey = createPublicKey({
    format: "jwk",
    key: {
      kty: "EC", crv: "P-256",
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33, 65).toString("base64url"),
    },
  });
  assert.ok(verify("sha256", Buffer.from(parts[0] + "." + parts[1]), {
    key: verifyingKey, dsaEncoding: "ieee-p1363",
  }, Buffer.from(parts[2], "base64url")));
});

test("test sends an empty visible push with no payload and no request redirects", async () => {
  let called = 0;
  const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    called += 1;
    assert.equal(String(input), endpoint);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(init?.headers && (init.headers as Record<string, string>).TTL, "120");
    assert.ok(!("body" in (init ?? {})));
    assert.match(String((init?.headers as Record<string, string>).Authorization), /^vapid t=/);
    return new Response(null, { status: 201 });
  };
  const result = await sendEmptyApplePush(endpoint, keys, mockedFetch as typeof fetch);
  assert.deepEqual(result, { ok: true, status: 201 });
  assert.equal(called, 1);
});

test("the preview-only server test requires authentication and never persists subscriptions", () => {
  const src = fs.readFileSync("app/api/notification-test/server-push/route.ts", "utf8");
  const sw = fs.readFileSync("public/notification-test-sw.js", "utf8");
  assert.match(src, /requireAdmin\(request\)/);
  assert.match(src, /process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(src, /process\.env\.ENABLE_SERVER_PUSH_TEST !== "true"/);
  assert.match(src, /isApplePushEndpoint\(body\.endpoint\)/);
  assert.match(src, /lastTestByUser\.get\(actor\.userId\)/);
  assert.match(src, /after\(async \(\) => \{/);
  assert.match(src, /sendEmptyApplePush\(endpoint, keys\)/);
  assert.doesNotMatch(src, /service_role|service_assignments|insert\(|upsert\(|localStorage/);
  assert.match(sw, /event\.waitUntil\(self\.registration\.showNotification/);
});
