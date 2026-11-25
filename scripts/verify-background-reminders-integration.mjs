/**
 * CI-only, disposable local Supabase integration. No deployed credentials,
 * actual worship records, or Apple network requests. Tests the same REST RPCs
 * and encryption/worker implementation used in production.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import ece from "http_ece";
import { getVerifiedSessionId, sendBackgroundPush } from "../lib/notifications/background-push.ts";
import { dispatchBackgroundReminders } from "../lib/notifications/dispatch-reminders.ts";

const dbUrl = new URL(process.env.DATABASE_URL ?? "http://invalid");
const apiUrl = new URL(process.env.LOCAL_SUPABASE_URL ?? "http://invalid");
const local = new Set(["127.0.0.1", "localhost"]);
assert.equal(process.env.GITHUB_ACTIONS, "true", "CI only");
assert.equal(process.env.BACKGROUND_REMINDER_LOCAL_TEST, "1", "Explicit disposable database opt-in required");
assert.ok(local.has(dbUrl.hostname) && ["postgres:", "postgresql:"].includes(dbUrl.protocol)
  && dbUrl.port === "54322" && dbUrl.pathname === "/postgres", "Expected local CLI database");
assert.ok(local.has(apiUrl.hostname) && apiUrl.protocol === "http:" && apiUrl.port === "54321", "Expected local CLI API");
assert.ok(!process.env.VERCEL, "Never use a deployed runtime");

const admin = createClient(apiUrl.origin, process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const makeUserClient = () => createClient(apiUrl.origin, process.env.LOCAL_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
function sql(source) {
  // SQL is fixed code plus local test UUIDs. Never print credentials or query output.
  return execFileSync("psql", [dbUrl.href, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000,
  }).trim();
}
function check(result, label) {
  if (result.error) throw new Error(label + " failed (" + (result.error.code || result.error.status || "unknown") + ")");
  return result.data;
}
function equal(value, expected, label) {
  if (value !== expected) throw new Error(label + " failed");
}
async function rpc(name, args) {
  return check(await admin.rpc(name, args), name);
}

const stages = [];
const day = "2030-01-06";
const opted = day + "T08:00:00+08:00";
const due = day + "T09:30:05+08:00";
const second = day + "T09:31:05+08:00";
const third = day + "T09:32:05+08:00";
const service = randomUUID();
const assignment = randomUUID();
const checkIn = randomUUID();
const endpoint = "https://web.push.apple.com/ci-fixture-" + randomUUID();
const receiver = createECDH("prime256v1");
receiver.generateKeys();
const auth = randomBytes(16);
const subscription = {
  endpoint,
  keys: { p256dh: receiver.getPublicKey(undefined, "uncompressed").toString("base64url"), auth: auth.toString("base64url") },
};
const keys = { ...webpush.generateVAPIDKeys(), subject: "https://example.invalid" };

try {
  // These definitions are deliberately not migrations yet; only the isolated
  // local database receives them, and the runner destroys it after tests.
  sql(fs.readFileSync("supabase/staged/background_task_reminders.sql", "utf8")
    + "\n" + fs.readFileSync("supabase/staged/background_task_reminder_cron.sql", "utf8")
    + "\nnotify pgrst, 'reload schema';");
  const password = randomBytes(24).toString("base64url");
  const email = "reminder-ci-" + randomUUID() + "@example.invalid";
  const created = check(await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: "CI Fixture" },
  }), "Create local user");
  const userId = created.user.id;
  const browser = makeUserClient();
  const signed = check(await browser.auth.signInWithPassword({ email, password }), "Sign in local user");
  const verified = check(await admin.auth.getUser(signed.session.access_token), "Verify local access token");
  const sessionId = getVerifiedSessionId("Bearer " + signed.session.access_token, verified.user.id);
  assert.ok(sessionId && /^[0-9a-f-]{36}$/i.test(sessionId), "Verified local session");
  equal(userId, verified.user.id, "Auth user");
  const other = makeUserClient();
  // The local fixture uses the same insert-time authorization triggers as the
  // SQL regression test, then retimestamps the isolated hall to a fixed Sunday.
  sql("begin;\n" +
    "update public.profiles set is_active=true where id='" + userId + "';\n" +
    "insert into public.user_roles(user_id,role) values('" + userId + "','volunteer') on conflict do nothing;\n" +
    "insert into public.worship_services(id,service_date,service_type,starts_at,status) values('" + service + "',(now() at time zone 'Asia/Taipei')::date,'__bg_ci__',now(),'published');\n" +
    "insert into public.service_assignments(id,service_id,user_id,role_label) values('" + assignment + "','" + service + "','" + userId + "','專招');\n" +
    "insert into public.service_check_ins(id,service_id,user_id,assignment_id,checked_in_at) values('" + checkIn + "','" + service + "','" + userId + "','" + assignment + "',now());\n" +
    "update public.worship_services set service_date='" + day + "',service_type='主一堂',starts_at='" + day + " 09:00:00+08' where id='" + service + "';\n" +
    "update public.service_check_ins set checked_in_at='" + opted + "' where id='" + checkIn + "';\n" +
    "insert into public.timeline_nodes(id,service_id,service_type,time,title,sort_order,is_active) values " +
    ["08:30","09:30","09:31","09:32"].map((time,i)=>"('__bg_ci_" + i + "__','" + service + "','主一堂','" + time + "','CI fixture'," + i + ",true)").join(",") + ";\n" +
    "insert into public.service_task_assignments(service_id,assignment_id,timeline_node_id) select '" + service + "','" + assignment + "',n.id from public.timeline_nodes n where n.service_id='" + service + "';\ncommit;");
  // Wait for the local PostgREST schema cache, not an external service.
  let ready = false;
  for (let i = 0; i < 20; i++) {
    const probe = await admin.rpc("background_reminder_open_bindings", { p_at: opted, p_user_id: userId, p_service_id: service });
    if (!probe.error) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Local PostgREST schema cache ready");
  const register = (at, endpointOverride = endpoint) => rpc("register_background_reminder_device", {
    p_user_id: userId, p_session_id: sessionId, p_service_type: "主一堂",
    p_endpoint: endpointOverride, p_p256dh: subscription.keys.p256dh, p_auth_secret: subscription.keys.auth, p_at: at,
  });
  const registered = await register(opted);
  equal(registered.length, 1, "REST registration");
  const device = registered[0].device_id;
  assert.ok(device, "Server device ID");
  const deniedArgs = {
    p_user_id: userId, p_session_id: sessionId, p_service_type: "主一堂",
    p_endpoint: endpoint, p_p256dh: subscription.keys.p256dh, p_auth_secret: subscription.keys.auth, p_at: opted,
  };
  assert.ok((await other.rpc("register_background_reminder_device", deniedArgs)).error, "Anon RPC denied");
  assert.ok((await browser.rpc("register_background_reminder_device", deniedArgs)).error, "Authenticated RPC denied");
  assert.ok((await browser.from("background_reminder_devices").select("endpoint")).error, "Subscription table denied");
  stages.push("real Auth session, REST registration, RLS and RPC grants");

  const notifications = [];
  const handlers = new Map();
  const self = {
    addEventListener: (name, callback) => handlers.set(name, callback),
    registration: { showNotification: async (title, options) => {
      notifications.push(JSON.parse(JSON.stringify({ title, ...options })));
    }},
  };
  // Exercise the actual service worker file in an isolated test context.
  vm.runInNewContext(fs.readFileSync("public/background-reminder-sw.js", "utf8"), { self, URL }, { timeout: 1000 });
  const push = async (body) => {
    let pending;
    handlers.get("push")({ data: { json: () => JSON.parse(body) }, waitUntil: p => { pending = p; } });
    await pending;
  };
  const store = (at) => ({
    claim: (limit) => rpc("claim_background_task_reminders", { p_at: at, p_limit: limit }),
    take: async (id) => (await rpc("take_background_task_reminder", { p_delivery_id: id, p_at: at }))[0] ?? null,
    finish: (id, state, status) => rpc("finish_background_task_reminder", {
      p_delivery_id: id, p_state: state, p_provider_status: status, p_at: at,
    }),
  });
  const sender = (at) => (sub, cue) => sendBackgroundPush(sub, cue, keys, async (url, options) => {
    equal(url, endpoint, "Apple endpoint");
    equal(options.redirect, "error", "Redirect protection");
    const headers = new Headers(options.headers);
    equal(headers.get("content-encoding"), "aes128gcm", "Encryption encoding");
    const decrypted = ece.decrypt(Buffer.from(options.body), {
      version: "aes128gcm", privateKey: receiver, authSecret: auth,
    }).toString("utf8");
    const payload = JSON.parse(decrypted);
    assert.deepEqual(Object.keys(payload).sort(), ["date","id","kind","service","time"]);
    equal(payload.id, cue.delivery_id, "Encrypted delivery identity");
    equal(payload.date, day, "Encrypted date");
    equal(payload.service, "主一堂", "Encrypted service");
    await push(decrypted);
    return new Response(null, { status: 201 });
  }, () => Date.parse(at));

  // Two independent dispatchers race for the same scheduled task. Only one
  // may obtain the database's atomic take and generate a visible notification.
  const pair = await Promise.all([
    dispatchBackgroundReminders(store(due), sender(due)),
    dispatchBackgroundReminders(store(due), sender(due)),
  ]);
  equal(pair.reduce((sum, v) => sum + v.accepted, 0), 1, "Concurrent delivery deduplication");
  equal(notifications.length, 1, "Exactly one notification");
  equal(notifications[0].body, day + " 主一堂 09:30 任務到點", "Worker display");
  equal((await dispatchBackgroundReminders(store(due), sender(due))).accepted, 0, "No replay");
  stages.push("concurrent REST claim/take, actual RFC8291 decrypt, actual worker notification");

  // Close the preference after the next task is claimed. The queued event
  // must be rejected at take, even though the dispatcher already saw it.
  const next = await store(second).claim(50);
  equal(next.length, 1, "Second claim");
  equal(await rpc("disable_background_reminder_device", { p_user_id: userId, p_endpoint: endpoint, p_at: second }), true, "REST revoke");
  equal(await store(second).take(next[0].delivery_id), null, "Revoke before send");
  equal(notifications.length, 1, "No notification after revoke");

  // A real Auth sign-out invalidates the session in the server's source of
  // truth. The same token/session must not be able to restore the binding.
  equal((await register(day + "T09:31:30+08:00"))[0].device_id, device, "Fresh opt-in");
  const thirdClaims = await store(third).claim(50);
  equal(thirdClaims.length, 1, "Third claim");
  check(await browser.auth.signOut(), "Real Auth sign-out");
  equal(await store(third).take(thirdClaims[0].delivery_id), null, "Sign-out before send");
  equal((await register(third)).length, 0, "Revoked session cannot register");
  equal(notifications.length, 1, "No notification after sign-out");
  stages.push("real REST revoke and Auth sign-out suppress claimed tasks");

  // pg_cron interval capability is verified only in this disposable database,
  // with a harmless SQL job unscheduled in the same transaction. No push.
  sql("begin;\ncreate extension if not exists pg_cron;\n" +
    "select cron.schedule('background-reminders-ci-check','10 seconds','select 1');\n" +
    "do $$ begin if not exists(select 1 from cron.job where jobname='background-reminders-ci-check' and schedule='10 seconds') then raise exception 'Interval schedule unsupported'; end if; end $$;\n" +
    "select cron.unschedule('background-reminders-ci-check');\nrollback;");
  stages.push("local pg_cron accepts 10-second interval (no live job)");
  console.log("Background reminder isolated integration passed: " + stages.join("; "));
} catch (error) {
  // Never dump HTTP, SQL, token, endpoint, key, or provider response bodies.
  console.error("Background reminder integration failed after: " + stages.join("; "));
  console.error(error instanceof Error ? error.name + ": " + error.message.slice(0, 200) : "Unknown error");
  process.exitCode = 1;
}
