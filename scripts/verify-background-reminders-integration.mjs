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
import { getVerifiedSessionId, sendBackgroundPush, validDispatcherAuthorization } from "../lib/notifications/background-push.ts";
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
  // The CI runner must have applied the actual CLI-generated candidate as
  // a migration. Never silently apply it here or mask migration failure.
  equal(sql("select to_regclass('public.background_reminder_devices') is not null and to_regprocedure('background_reminder_private.queue_due_dispatch()') is not null;"), "t", "Migrated reminder schema");
  stages.push("CLI migration installed");
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
  const signup = await other.auth.signUp({
    email: "reminder-denied-" + randomUUID() + "@example.invalid",
    password: randomBytes(24).toString("base64url"),
  });
  equal(signup.error?.code, "signup_disabled", "Public self-registration must remain disabled");
  stages.push("existing users can sign in; public signup denied");
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

  // Exercise actual Vault -> pg_net queue -> Node authorization with the
  // fixed task time. pg_net only sends after COMMIT; all of this is rolled
  // back. The only secret here is randomly generated in the disposable CI
  // process. Never print SQL, queued headers, or the test secret.
  const dispatchSecret = randomBytes(32).toString("hex");
  const signedHeader = sql("begin;\n" +
    "create schema if not exists vault;\n" +
    "create extension if not exists supabase_vault with schema vault;\n" +
    "create extension if not exists pg_net with schema extensions;\n" +
    "do $$ begin " +
    "if background_reminder_private.queue_due_dispatch_at('" + due + "') then raise exception 'Missing vault secret must not queue'; end if; " +
    "perform vault.create_secret('" + dispatchSecret + "','background_reminder_dispatch_secret'); " +
    "if background_reminder_private.queue_due_dispatch_at('" + day + "T09:29:59+08:00') then raise exception 'Early queue forbidden'; end if; " +
    "if not background_reminder_private.queue_due_dispatch_at('" + due + "') then raise exception 'Expected due queue'; end if; " +
    "if (select count(*) from net.http_request_queue) <> 1 then raise exception 'Expected exactly one queued request'; end if; " +
    "end $$;\n" +
    "select headers->>'Authorization' from net.http_request_queue where method='POST' and url='https://servant-timeline.vercel.app/api/background-reminders/dispatch';\n" +
    "rollback;");
  equal(signedHeader.includes(dispatchSecret), false, "No reusable secret in queued header");
  equal(validDispatcherAuthorization(signedHeader, dispatchSecret, () => Date.parse(due)), true, "Postgres/Node signed dispatch interoperability");
  equal(validDispatcherAuthorization(signedHeader, dispatchSecret, () => Date.parse(due) + 31_000), false, "Queued signature expires");
  stages.push("real Vault and pg_net queue, short-lived signed authorization, rollback without HTTP");

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


  // Test an actual admin Auth session on Thursday with no formal check-in,
  // using the same service-role RPCs, encryption and worker as production.
  const testDay = "2030-01-03";
  const testOpt = testDay + "T18:00:00+08:00";
  const testDue = testDay + "T19:00:05+08:00";
  const testNext = testDay + "T19:01:05+08:00";
  const testEmail = "admin-reminder-ci-" + randomUUID() + "@example.invalid";
  const testPassword = randomBytes(24).toString("base64url");
  const testUser = check(await admin.auth.admin.createUser({
    email: testEmail, password: testPassword, email_confirm: true, user_metadata: { display_name: "Admin fixture" },
  }), "Create local admin").user.id;
  const testBrowser = makeUserClient();
  const testSigned = check(await testBrowser.auth.signInWithPassword({ email: testEmail, password: testPassword }), "Sign in admin fixture");
  const testSession = getVerifiedSessionId("Bearer " + testSigned.session.access_token, testUser);
  assert.ok(testSession);
  const testEndpoint = endpoint + "-admin";
  sql("begin;\n" +
    "update public.profiles set is_active=true where id='" + testUser + "';\n" +
    "update public.timeline_nodes set is_active=false where service_id is null and service_type='六晚崇';\n" +
    "insert into public.timeline_nodes(id,service_type,time,title,sort_order,is_active) values " +
    ["18:30","19:00","19:00","19:01"].map((time,i)=>"('__admin_ci_" + i + "__','六晚崇','" + time + "','Admin fixture'," + i + ",true)").join(",") + ";\ncommit;");
  const testRegisterArgs = {
    p_user_id: testUser,p_session_id: testSession,p_service_type: "六晚崇",p_endpoint: testEndpoint,
    p_p256dh: subscription.keys.p256dh,p_auth_secret: subscription.keys.auth,p_at: testOpt,
  };
  equal((await rpc("register_admin_timeline_reminder_device",testRegisterArgs)).length,0,"Non-admin rejected even via trusted service-role RPC");
  sql("insert into public.user_roles(user_id,role) values('" + testUser + "','admin') on conflict do nothing;");
  equal((await rpc("register_admin_timeline_reminder_device",testRegisterArgs)).length,1,"Admin weekday registration without check-in");
  assert.ok((await testBrowser.rpc("register_admin_timeline_reminder_device",testRegisterArgs)).error,"Admin cannot call service-only registration directly");
  const testStore = at => ({
    claim: limit => rpc("claim_admin_timeline_reminders",{p_at:at,p_limit:limit}),
    take: async id => (await rpc("take_admin_timeline_reminder",{p_delivery_id:id,p_at:at}))[0] ?? null,
    finish: (id,state,status) => rpc("finish_admin_timeline_reminder",{p_delivery_id:id,p_state:state,p_provider_status:status,p_at:at}),
  });
  const testSender = (sub,cue) => sendBackgroundPush(sub,{...cue,adminTest:true},keys,async (url,options) => {
    equal(url,testEndpoint,"Admin fixture endpoint");
    const decrypted=ece.decrypt(Buffer.from(options.body),{version:"aes128gcm",privateKey:receiver,authSecret:auth}).toString("utf8");
    const payload=JSON.parse(decrypted);
    assert.deepEqual(Object.keys(payload).sort(),["date","id","kind","service","time"]);
    equal(payload.kind,"service-task-reminder-admin-test","Test-only notification marker");
    equal(payload.date,testDay,"Weekday notification date");
    equal(payload.service,"六晚崇","Selected timeline");
    await push(decrypted);
    return new Response(null,{status:201});
  },()=>Date.parse(testDue));
  const testPair=await Promise.all([
    dispatchBackgroundReminders(testStore(testDue),testSender),
    dispatchBackgroundReminders(testStore(testDue),testSender),
  ]);
  equal(testPair.reduce((sum,x)=>sum+x.accepted,0),1,"Admin test concurrent dispatch");
  equal(notifications.at(-1).body,testDay+" 六晚崇 19:00 任務到點（管理員測試）","Test-only worker display");
  equal(notifications.length,2,"No duplicate test notification");
  equal((await rpc("claim_background_task_reminders",{p_at:testDue,p_limit:50})).length,0,"Formal dispatch still closed on Thursday");
  const testClaims=await testStore(testNext).claim(50);
  equal(testClaims.length,1,"Next admin cue claimed");
  check(await testBrowser.auth.signOut(),"Admin Auth sign-out");
  equal(await testStore(testNext).take(testClaims[0].delivery_id),null,"Admin sign-out suppresses claimed cue");
  stages.push("admin Thursday REST registration without check-in, role rejection, concurrent encrypted delivery, worker marker and sign-out");


  // Rehearsal integration uses real local Auth/REST, not a deployed endpoint.
  // Reuse the fixture template and transport mock. Multiple simultaneous
  // requests go through separate PostgREST transactions.
  const rehearsalAdminSigned=check(await testBrowser.auth.signInWithPassword({email:testEmail,password:testPassword}),"Rehearsal admin login");
  const rehearsalAdminSession=getVerifiedSessionId("Bearer "+rehearsalAdminSigned.session.access_token,testUser);
  assert.ok(rehearsalAdminSession,"Rehearsal admin session");
  const rehearsalEmail="rehearsal-ci-"+randomUUID()+"@example.invalid";
  const rehearsalPassword=randomBytes(24).toString("base64url");
  const rehearsalUser=check(await admin.auth.admin.createUser({
    email:rehearsalEmail,password:rehearsalPassword,email_confirm:true,user_metadata:{display_name:"Rehearsal coordinator"},
  }),"Create rehearsal coordinator").user.id;
  const rehearsalBrowser=makeUserClient();
  const rehearsalSigned=check(await rehearsalBrowser.auth.signInWithPassword({email:rehearsalEmail,password:rehearsalPassword}),"Coordinator login");
  const rehearsalSession=getVerifiedSessionId("Bearer "+rehearsalSigned.session.access_token,rehearsalUser);
  assert.ok(rehearsalSession,"Coordinator session");
  sql("begin; update public.profiles set is_active=true where id='"+rehearsalUser+"'; "+
    "insert into public.user_roles(user_id,role) values('"+rehearsalUser+"','coordinator') on conflict do nothing; commit;");
  const aArgs={p_actor:testUser,p_session:rehearsalAdminSession};
  const cArgs={p_actor:rehearsalUser,p_session:rehearsalSession};
  const startArgs={...aArgs,p_service_type:"六晚崇"};
  const simultaneousStarts=await Promise.all([
    admin.rpc("start_service_rehearsal",startArgs),admin.rpc("start_service_rehearsal",startArgs),
  ]);
  equal(simultaneousStarts.filter(x=>!x.error).length,1,"Only one concurrent start succeeds");
  equal(simultaneousStarts.filter(x=>x.error?.code==="23505").length,1,"Second start rejected by database uniqueness");
  const practiceId=simultaneousStarts.find(x=>!x.error).data;
  const pArgs={...cArgs,p_rehearsal:practiceId};
  const adminPracticeArgs={...aArgs,p_rehearsal:practiceId};
  const beforeReport=await rpc("get_service_rehearsal_participant_state",cArgs);
  equal(beforeReport.rehearsal.id,practiceId,"Coordinator sees open rehearsal without roster");
  equal(beforeReport.checkedInAt,null,"Coordinator not yet checked in");
  equal(beforeReport.nodes.length,0,"No private snapshot before report");
  assert.ok((await rehearsalBrowser.rpc("check_in_service_rehearsal",{...pArgs,p_on_church_network:true})).error,
    "Authenticated client cannot forge network authorization");
  assert.ok((await admin.rpc("check_in_service_rehearsal",{...pArgs,p_on_church_network:false})).error,
    "Server denies offsite report");
  const simultaneousReports=await Promise.all([
    rpc("check_in_service_rehearsal",{...pArgs,p_on_church_network:true}),
    rpc("check_in_service_rehearsal",{...pArgs,p_on_church_network:true}),
    rpc("check_in_service_rehearsal",{...pArgs,p_on_church_network:true}),
  ]);
  equal(new Set(simultaneousReports).size,1,"Parallel duplicate report preserves first timestamp");
  await rpc("check_in_service_rehearsal",{...adminPracticeArgs,p_on_church_network:true});
  const practiceState=await rpc("get_service_rehearsal_participant_state",cArgs);
  const blocks=[...new Set(practiceState.nodes.map(n=>Date.parse(n.dueAt)))].sort((a,b)=>a-b);
  equal(blocks.length,3,"Template time blocks grouped");
  const at=(block,seconds)=>new Date(block+seconds*1000).toISOString();
  const makeEndpoint=()=>endpoint+"-rehearsal-"+randomUUID();
  const practiceEndpoints=[makeEndpoint(),makeEndpoint()];
  const allowedEndpoints=new Set(practiceEndpoints);
  const regArgs=(ep,asAdmin=false)=>({
    p_user_id:asAdmin?testUser:rehearsalUser,p_session_id:asAdmin?rehearsalAdminSession:rehearsalSession,
    p_rehearsal_id:practiceId,p_endpoint:ep,p_p256dh:subscription.keys.p256dh,p_auth_secret:subscription.keys.auth,
  });
  assert.ok((await rehearsalBrowser.rpc("register_rehearsal_reminder_device",regArgs(practiceEndpoints[0]))).error,
    "Rehearsal registration RPC is server-only");
  equal((await rpc("register_rehearsal_reminder_device",regArgs(practiceEndpoints[0]))).length,1,"Coordinator rehearsal device");
  equal((await rpc("register_rehearsal_reminder_device",regArgs(practiceEndpoints[1],true))).length,1,"Admin rehearsal device");
  equal((await rpc("register_rehearsal_reminder_device",regArgs(practiceEndpoints[0],true))).length,0,"Foreign subscription reuse denied");
  stages.push("rehearsal Auth/REST, concurrent start and check-in, device authorization");
  const practiceStore=time=>({
    claim:limit=>rpc("claim_rehearsal_reminders",{p_at:time,p_limit:limit}),
    take:async id=>(await rpc("take_rehearsal_reminder",{p_delivery_id:id,p_at:time}))[0]??null,
    finish:(id,state,status)=>rpc("finish_rehearsal_reminder",{p_delivery_id:id,p_state:state,p_provider_status:status,p_at:time}),
  });
  const seenPracticeDeliveries=new Set();
  const seenPracticeEndpoints=new Map();
  const practiceSender=time=>(sub,cue)=>sendBackgroundPush(sub,{...cue,rehearsal:true},keys,async(url,options)=>{
    assert.ok(allowedEndpoints.has(url),"Only locally registered rehearsal endpoint");
    const decrypted=ece.decrypt(Buffer.from(options.body),{version:"aes128gcm",privateKey:receiver,authSecret:auth}).toString("utf8");
    const payload=JSON.parse(decrypted);
    assert.deepEqual(Object.keys(payload).sort(),["date","id","kind","service","time"]);
    equal(payload.kind,"service-task-reminder-rehearsal","Rehearsal marker");
    equal(payload.service,"六晚崇","Rehearsal template");
    assert.ok(!seenPracticeDeliveries.has(payload.id),"Duplicate delivery");
    seenPracticeDeliveries.add(payload.id);
    const key=cue.scheduled_at+"|"+url;
    assert.ok(!seenPracticeEndpoints.has(key),"Duplicate device/time notification");
    seenPracticeEndpoints.set(key,true);
    await push(decrypted);
    return new Response(null,{status:201});
  },()=>Date.parse(time));
  const beforeNotifications=notifications.length;
  const firstAt=at(blocks[0],5);
  const rehearsalPair=await Promise.all([
    dispatchBackgroundReminders(practiceStore(firstAt),practiceSender(firstAt)),
    dispatchBackgroundReminders(practiceStore(firstAt),practiceSender(firstAt)),
  ]);
  equal(rehearsalPair.reduce((s,x)=>s+x.accepted,0),2,"Concurrent rehearsal dispatch exactly once per device");
  equal(notifications.length,beforeNotifications+2,"Exactly two rehearsal worker notifications");
  equal(notifications.at(-1).title,"夏凱納招待｜服事演練","Rehearsal worker title");
  assert.ok(notifications.at(-1).body.endsWith("（演練，非正式服事）"),"Rehearsal worker marker");

  // Simulate 60 device bindings across two authenticated accounts. This
  // verifies the 50-claim batch limit and the next 10 within the allowed
  // due window, not the latency of Apple or production capacity.
  const extraEndpoints=Array.from({length:58},makeEndpoint);
  for(let offset=0;offset<extraEndpoints.length;offset+=10){
    const group=extraEndpoints.slice(offset,offset+10);
    await Promise.all(group.map(async(ep,index)=>{
      equal((await rpc("register_rehearsal_reminder_device",regArgs(ep,(offset+index)%2===0))).length,1,"Synthetic device registration");
      allowedEndpoints.add(ep);
    }));
  }
  const secondAt=at(blocks[1],5),secondLater=at(blocks[1],15);
  const batch1=await dispatchBackgroundReminders(practiceStore(secondAt),practiceSender(secondAt));
  const batch2=await dispatchBackgroundReminders(practiceStore(secondLater),practiceSender(secondLater));
  equal(batch1.claimed,50,"First batch bounded to fifty");
  equal(batch1.accepted,50,"First batch accepted");
  equal(batch2.claimed,10,"Next batch receives remaining ten");
  equal(batch2.accepted,10,"Remaining ten accepted");
  equal(notifications.length,beforeNotifications+62,"Exactly sixty distinct device notifications at second block");
  equal((await dispatchBackgroundReminders(practiceStore(secondLater),practiceSender(secondLater))).accepted,0,"No repeat dispatch");
  stages.push("rehearsal concurrent encrypted dispatch and worker; 60 synthetic devices across two bounded batches");

  // Claim the final block before an actual Auth sign-out and manual end.
  const finalAt=at(blocks[2],5);
  const lastClaims=await practiceStore(finalAt).claim(50);
  equal(lastClaims.length,50,"Final block claims");
  check(await rehearsalBrowser.auth.signOut(),"Rehearsal coordinator Auth sign-out");
  const coordinatorDelivery=sql("select l.id from service_rehearsal_private.deliveries l join service_rehearsal_private.devices d on d.id=l.device_id where l.rehearsal_id='"+practiceId+"' and d.user_id='"+rehearsalUser+"' and l.state='claimed' limit 1;");
  assert.ok(coordinatorDelivery,"Claimed coordinator fixture");
  equal(await practiceStore(finalAt).take(coordinatorDelivery),null,"Signed out participant cannot receive already-claimed reminder");
  // Race a real admin end with a take. The take may win before end commits,
  // but no fresh take/claim may succeed once the end response is confirmed.
  const adminDelivery=sql("select l.id from service_rehearsal_private.deliveries l join service_rehearsal_private.devices d on d.id=l.device_id where l.rehearsal_id='"+practiceId+"' and d.user_id='"+testUser+"' and l.state='claimed' limit 1;");
  assert.ok(adminDelivery,"Claimed admin fixture");
  const race=await Promise.all([
    rpc("end_service_rehearsal",adminPracticeArgs),practiceStore(finalAt).take(adminDelivery),
  ]);
  assert.ok(race[0],"End acknowledged");
  equal((await practiceStore(finalAt).claim(50)).length,0,"No claims after end");
  equal(await practiceStore(finalAt).take(adminDelivery),null,"No take after end");
  equal(sql("select count(*) from service_rehearsal_private.devices where rehearsal_id='"+practiceId+"' and enabled;"),"0","All devices disabled transactionally");
  const closed=await rpc("get_service_rehearsal_participant_state",aArgs);
  equal(closed.rehearsal,null,"Closed rehearsal no longer visible");
  equal(closed.checkedInAt,null,"Closed rehearsal check-in cleared");
  equal((await rpc("end_service_rehearsal",adminPracticeArgs)),race[0],"Manual end idempotent");
  assert.ok((await admin.rpc("check_in_service_rehearsal",{...adminPracticeArgs,p_on_church_network:true})).error,"Old report cannot reopen rehearsal");
  stages.push("rehearsal sign-out, concurrent manual end/take, post-end invalidation");

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
