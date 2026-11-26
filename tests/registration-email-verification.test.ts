import test from "node:test";
import assert from "node:assert/strict";
import {
  createRegistrationCode, createRegistrationToken, isRegistrationCode,
  isRegistrationToken, registrationCodeDigest, registrationDigest, registrationLink, isRegistrationOriginAllowed,
} from "../lib/auth/registration-verification.ts";
import { cleanRegistrationMailLink, normalizeRegistrationCodeInput, readRegistrationMailLink } from "../lib/auth/registration-verification-client.ts";
import { registrationEmailContent } from "../lib/email/registration-verification-template.ts";

test("registration tokens are unguessable, OTPs preserve leading zeroes", () => {
  const tokens = Array.from({ length: 64 }, createRegistrationToken);
  assert.equal(new Set(tokens).size, 64);
  for (const token of tokens) {
    assert.ok(isRegistrationToken(token));
    assert.match(registrationDigest(token), /^[a-f0-9]{64}$/);
  }
  for (let i = 0; i < 100; i++) assert.ok(isRegistrationCode(createRegistrationCode()));
  assert.ok(isRegistrationCode("000012"));
  assert.equal(isRegistrationCode("12345"), false);
  assert.equal(normalizeRegistrationCodeInput("０ ０ ０ ０ １ ２"), "000012");
});

test("OTP digest is keyed and bound to its own challenge", () => {
  const secret = "test-key-not-a-production-secret-0123456789";
  const a = registrationDigest(createRegistrationToken());
  const b = registrationDigest(createRegistrationToken());
  assert.equal(registrationCodeDigest(secret, a, "123456"), registrationCodeDigest(secret, a, "123456"));
  assert.notEqual(registrationCodeDigest(secret, a, "123456"), registrationCodeDigest(secret, b, "123456"));
  assert.notEqual(registrationCodeDigest(secret, a, "123456"), registrationCodeDigest(secret, a, "123457"));
  assert.throws(() => registrationCodeDigest("", a, "123456"));
});

test("verification and copy links keep credentials out of GET request path", () => {
  const origin = "https://example.test";
  const token = createRegistrationToken();
  const verify = registrationLink(origin, "verify", token);
  const copy = registrationLink(origin, "copy", "000012");
  assert.equal(new URL(verify).search, "?registration=verify");
  assert.equal(new URL(copy).search, "?registration=copy");
  assert.deepEqual(readRegistrationMailLink(verify), { mode: "verify", value: token });
  assert.deepEqual(readRegistrationMailLink(copy), { mode: "copy", value: "000012" });
  assert.equal(cleanRegistrationMailLink(verify), "/");
  assert.equal(readRegistrationMailLink(origin + "/?registration=verify#token=bad"), null);
});

test("email has branded accessible HTML, a selectable code and plaintext fallback", () => {
  const content = registrationEmailContent({
    code: "000012",
    verifyUrl: "https://example.test/?registration=verify#token=example",
  });
  assert.match(content.htmlContent, /#00B8B8/);
  assert.match(content.htmlContent, /#785AA5/);
  assert.match(content.htmlContent, /#7A7A73/);
  assert.match(content.htmlContent, />000012</);
  assert.match(content.htmlContent, /長按驗證碼複製/);
  assert.equal((content.htmlContent.match(/<a\s+href=/gi) ?? []).length, 1);
  assert.equal((content.textContent.match(/https:\/\//g) ?? []).length, 1);
  assert.doesNotMatch(content.htmlContent, /registration=copy|<img\b|<button\b/i);
  assert.doesNotMatch(content.textContent, /registration=copy/);
  assert.match(content.textContent, /000012/);
  assert.match(content.textContent, /驗證有效期限為 10 分鐘/);
  assert.doesNotMatch(content.htmlContent, /<script|onclick=/i);
});

test("registration origin checks actual loopback authority and Vercel HTTPS, never foreign origins", () => {
  const local = {
    origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000",
    contentType: "application/json; charset=UTF-8", requestOrigin: "http://localhost:3000",
    isVercel: false, isDevelopment: true,
  };
  assert.equal(isRegistrationOriginAllowed(local), true);
  assert.equal(isRegistrationOriginAllowed({ ...local, origin: "http://localhost:3000" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, origin: "http://127.0.0.1:3001" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, origin: "null" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, origin: null }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, host: null }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, contentType: "text/plain; application/json" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...local, origin: "http://evil.example", host: "evil.example" }), false);

  const deployed = {
    ...local, origin: "https://servant-timeline.vercel.app", host: "servant-timeline.vercel.app",
    isVercel: true, isDevelopment: false,
  };
  assert.equal(isRegistrationOriginAllowed(deployed), true);
  assert.equal(isRegistrationOriginAllowed({ ...deployed, origin: "https://evil.example" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...deployed, origin: "http://servant-timeline.vercel.app" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...deployed, origin: "https://servant-timeline.vercel.app/path" }), false);
  assert.equal(isRegistrationOriginAllowed({ ...deployed, isVercel: false }), false);
  assert.equal(isRegistrationOriginAllowed({ ...deployed, isVercel: false, requestOrigin: deployed.origin }), true);
});
