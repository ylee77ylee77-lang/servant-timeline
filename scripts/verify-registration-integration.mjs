/**
 * Real registration route + Supabase integration in the disposable CI stack.
 * Seed the same digests the Gmail sender would issue, without contacting Gmail.
 * No production project, reusable secret, or real volunteer may be used.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { accountCodeToInternalEmail } from "../lib/auth/account-code.ts";
import {
  createRegistrationToken, registrationDigest, registrationCodeDigest,
  REGISTRATION_COOKIE,
} from "../lib/auth/registration-verification.ts";

const api = new URL(process.env.LOCAL_SUPABASE_URL || "http://invalid");
const db = new URL(process.env.DATABASE_URL || "http://invalid");
const local = new Set(["localhost", "127.0.0.1"]);
assert.equal(process.env.GITHUB_ACTIONS, "true", "CI only");
assert.equal(process.env.REGISTRATION_LOCAL_TEST, "1", "Explicit isolated test opt-in");
assert.ok(!process.env.VERCEL, "Never run against a deployment");
assert.ok(local.has(api.hostname) && api.protocol === "http:" && api.port === "54321", "Expected local Supabase API");
assert.ok(local.has(db.hostname) && db.port === "54322" && db.pathname === "/postgres"
  && ["postgres:", "postgresql:"].includes(db.protocol), "Expected local Supabase database");
const adminKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
assert.ok(adminKey && anonKey, "Local CLI credentials are required");

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(api.origin, adminKey, options);
const makeBrowser = () => createClient(api.origin, anonKey, options);
const secret = randomBytes(32).toString("hex");
const origin = "http://127.0.0.1:3000";
const route = "/api/register/verification";
const codes = [];
const stages = [];
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: api.origin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_URL: api.origin,
    SUPABASE_SERVICE_ROLE_KEY: adminKey,
    REGISTRATION_VERIFICATION_SECRET: secret,
    // This suite must never send email to a network destination.
    GMAIL_SMTP_USER: "",
    GMAIL_APP_PASSWORD: "",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: "ignore",
});
function check(response, label) {
  if (response.error) throw new Error(label + " failed (" + (response.error.code || response.error.status || "unknown") + ")");
  return response.data;
}
async function rpc(name, args) {
  return check(await admin.rpc(name, args), name);
}
function sessionCookie(token) { return REGISTRATION_COOKIE + "=" + token; }
async function request(path, body, cookie = "", requestOrigin = origin) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers.Origin = requestOrigin;
  }
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, cookie: response.headers.get("set-cookie") || "",
    cacheControl: response.headers.get("cache-control") || "" };
}
function status(result, expected, label) {
  if (result.status !== expected) throw new Error(label + ": expected HTTP " + expected + ", received " + result.status);
}
function cookieFrom(result) {
  assert.ok(/;\s*HttpOnly(?:;|$)/i.test(result.cookie), "HttpOnly registration session");
  assert.ok(/;\s*SameSite=strict(?:;|$)/i.test(result.cookie), "SameSite registration session");
  const value = result.cookie.split(";")[0];
  assert.ok(value.startsWith(REGISTRATION_COOKIE + "="), "Cookie name");
  return value;
}
async function seed(label) {
  const accountCode = "reg-ci-" + randomBytes(6).toString("hex");
  codes.push(accountCode);
  const identity = { displayName: "CI " + label, accountCode, contactEmail: accountCode + "@example.invalid" };
  const session = createRegistrationToken();
  const link = createRegistrationToken();
  const digest = registrationDigest(session);
  const otp = "000012";
  const args = { p_old_session: "", p_session: digest, p_link: registrationDigest(link),
    p_code: registrationCodeDigest(secret, digest, otp), p_display_name: identity.displayName,
    p_account_code: accountCode, p_contact_email: identity.contactEmail, p_source: "" };
  assert.equal(await rpc("registration_email_start", args), "created", "Seed through real server RPC");
  return { identity, session: sessionCookie(session), link, otp, args };
}
function registrationBody(fixture) {
  return { ...fixture.identity, password: randomBytes(18).toString("base64url") };
}
async function verifyCreated(fixture, body) {
  const profile = check(await admin.from("profiles").select("id,is_active,display_name")
    .eq("account_code", fixture.identity.accountCode).single(), "Created profile");
  assert.equal(profile.display_name, fixture.identity.displayName);
  assert.equal(profile.is_active, false, "No unreviewed activation");
  const roles = check(await admin.from("user_roles").select("role").eq("user_id", profile.id), "Created roles");
  assert.equal(roles.length, 0, "No unreviewed role");
  const contact = check(await admin.from("account_recovery_contacts").select("contact_email,email_verified_at,email_verification_required")
    .eq("user_id", profile.id).single(), "Verified contact");
  assert.equal(contact.contact_email, fixture.identity.contactEmail);
  assert.ok(contact.email_verified_at && contact.email_verification_required, "Persisted verification");
  const browser = makeBrowser();
  check(await browser.auth.signInWithPassword({ email: accountCodeToInternalEmail(fixture.identity.accountCode), password: body.password }),
    "Existing internal-account sign-in");
  assert.ok((await browser.from("registration_email_challenges").select("id")).error, "Authenticated table access denied");
  assert.ok((await browser.rpc("registration_email_verify_link", { p_link: fixture.args.p_link, p_new_session: fixture.args.p_session })).error,
    "Authenticated verification RPC denied");
  await browser.auth.signOut();
  return profile.id;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error("Local Next.js process exited");
    try {
      const result = await request(route);
      if (result.status === 200) { ready = true; break; }
    } catch { /* Wait only for the local server to start. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Local registration API ready");

  const otp = await seed("OTP");
  const anon = makeBrowser();
  assert.ok((await anon.from("registration_email_challenges").select("id")).error, "Anon table access denied");
  assert.ok((await anon.rpc("registration_email_start", otp.args)).error, "Anon challenge creation denied");
  const body = registrationBody(otp);
  const unverified = await request("/api/register", body);
  status(unverified, 403, "No verified cookie");
  assert.equal(unverified.data.error, "請先完成電子郵件驗證。", "Reached registration credential check");
  const pendingRegistration = await request("/api/register", body, otp.session);
  status(pendingRegistration, 403, "Pending challenge");
  assert.equal(pendingRegistration.data.error, "請先完成電子郵件驗證或重新發送驗證信。", "Reached server claim check");
  status(await request(route, { action: "verify-code", code: otp.otp }, otp.session, "https://example.invalid"), 403, "Cross-origin POST");
  const pending = await request(route, undefined, otp.session);
  status(pending, 200, "Pending draft");
  assert.equal(pending.data.draft.status, "pending");
  assert.ok(pending.cacheControl.includes("no-store"), "No cached private draft");
  const wrong = await request(route, { action: "verify-code", code: "999999" }, otp.session);
  status(wrong, 400, "Wrong OTP");
  assert.equal(wrong.data.error, "驗證碼錯誤，請重新輸入。", "Wrong code reaches the actual database verification");
  const verified = await request(route, { action: "verify-code", code: otp.otp }, otp.session);
  status(verified, 200, "OTP verification");
  assert.equal(verified.data.draft.status, "verified");
  status(await request(route, { action: "verify-link", token: otp.link }), 400, "Link unavailable after OTP");
  status(await request("/api/register", { ...body, contactEmail: "changed@example.invalid" }, otp.session), 403, "Unverified changed address");
  const submissions = await Promise.all([
    request("/api/register", body, otp.session),
    request("/api/register", body, otp.session),
  ]);
  assert.equal(submissions.filter(result => result.status === 201).length, 1, "Only one registration wins");
  assert.ok(submissions.some(result => [403, 409].includes(result.status)), "Concurrent duplicate rejected");
  const id = await verifyCreated(otp, body);
  check(await admin.from("account_recovery_contacts").update({ contact_email: "ci-new@example.invalid" }).eq("user_id", id), "Change contact address");
  const changed = check(await admin.from("account_recovery_contacts").select("email_verified_at,email_verification_required").eq("user_id", id).single(), "Changed contact");
  assert.equal(changed.email_verified_at, null);
  assert.equal(changed.email_verification_required, true);
  stages.push("OTP, leading zero, origin protection, unauthenticated denial, concurrent completion, unchanged sign-in and contact invalidation");

  const link = await seed("LINK");
  const linkBody = registrationBody(link);
  const opening = await request(route, { action: "verify-link", token: link.link });
  status(opening, 200, "Different browser link");
  const newCookie = cookieFrom(opening);
  assert.equal(opening.data.draft.accountCode, link.identity.accountCode);
  assert.equal(opening.data.draft.status, "verified");
  status(await request(route, { action: "verify-link", token: link.link }), 400, "Link replay denied");
  const observed = await request(route, undefined, link.session);
  status(observed, 200, "Original PWA reads shared status");
  assert.equal(observed.data.draft.status, "verified_elsewhere");
  assert.ok(observed.data.draft.resumeUntil, "Original code can authorize handoff before expiry");
  assert.equal(observed.data.draft.accountCode, link.identity.accountCode);
  assert.ok(!("session_digest" in observed.data.draft), "No capability exposed");
  assert.equal((await request(route)).data.draft, null, "Unrelated browser cannot read status");
  status(await request("/api/register", linkBody, link.session), 403, "Observation cannot authorize registration");
  status(await request(route, { action: "verify-code", code: "999999" }, link.session), 400, "Wrong handoff code");
  status(await request("/api/register", linkBody, newCookie), 201, "New browser completes registration");
  assert.equal((await request(route, undefined, link.session)).data.draft.status, "used_elsewhere", "Claim use synchronized");
  await verifyCreated(link, linkBody);
  stages.push("Shared verified status, original browser cannot claim without proof, browser continuation");

  const handoff = await seed("HANDOFF");
  const handoffBody = registrationBody(handoff);
  const handoffLink = await request(route, { action: "verify-link", token: handoff.link });
  status(handoffLink, 200, "Link before handoff");
  const browserCookie = cookieFrom(handoffLink);
  status(await request("/api/register", handoffBody, handoff.session), 403, "Original PWA still needs proof");
  assert.ok((await anon.rpc("registration_email_resume", { p_session: handoff.args.p_session, p_code: handoff.args.p_code })).error, "Anon handoff denied");
  const resumed = await request(route, { action: "verify-code", code: handoff.otp }, handoff.session);
  status(resumed, 200, "Original PWA proves ownership to resume");
  assert.equal(resumed.data.draft.status, "verified");
  assert.equal((await request(route, undefined, browserCookie)).data.draft.status, "verified_elsewhere", "Browser becomes status-only observer");
  assert.equal((await request(route, undefined, browserCookie)).data.draft.resumeUntil, null, "No repeated handoff");
  status(await request("/api/register", handoffBody, browserCookie), 403, "Browser loses claim after transfer");
  status(await request("/api/register", handoffBody, handoff.session), 201, "Original PWA completes registration");
  assert.equal((await request(route, undefined, browserCookie)).data.draft.status, "used_elsewhere");
  await verifyCreated(handoff, handoffBody);
  stages.push("One-time OTP-authorized transfer, observer never receives a claim, exactly one registration");

  const failureCode = "reg-ci-" + randomBytes(6).toString("hex");
  codes.push(failureCode);
  const failure = await request(route, {
    action: "send", displayName: "CI SMTP failure", accountCode: failureCode, contactEmail: failureCode + "@example.invalid",
  });
  status(failure, 502, "Unconfigured SMTP fails closed");
  const failed = check(await admin.from("registration_email_challenges").select("status").eq("account_code", failureCode).single(), "Failed delivery");
  assert.equal(failed.status, "invalidated");
  assert.equal(failure.cookie, "", "No verification cookie for failed send");
  stages.push("Mail configuration failure cannot authorize registration");

  for (const stage of stages) console.log("PASS: " + stage);
} finally {
  server.kill("SIGTERM");
  // All these records are local fixtures; do not print identifiers or secrets.
  for (const accountCode of codes) {
    const found = await admin.from("profiles").select("id").eq("account_code", accountCode).maybeSingle();
    if (found.data?.id) await admin.auth.admin.deleteUser(found.data.id);
    await admin.from("registration_email_challenges").delete().eq("account_code", accountCode);
  }
}
