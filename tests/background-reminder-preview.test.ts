import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPreviewReminderPlan, runPreviewReminderPlan } from "../lib/notifications/preview-reminder-plan.ts";
import { makeReminderPayload } from "../lib/notifications/background-push.ts";

test("preview uses three distinct server-time cues and marks only simulated payloads", async () => {
  let now = Date.parse("2030-01-06T01:30:00Z");
  const start = now;
  const plan = buildPreviewReminderPlan(now);
  assert.deepEqual(plan.map(cue => Date.parse(cue.scheduled_at) - start), [15000,30000,45000]);
  assert.equal(new Set(plan.map(cue => cue.delivery_id)).size,3);
  assert.equal(JSON.parse(makeReminderPayload(plan[0])).kind,"service-task-reminder-preview");
  assert.equal(JSON.parse(makeReminderPayload({...plan[0],previewTest:false})).kind,"service-task-reminder");
  const observed: number[] = [];
  const result = await runPreviewReminderPlan(plan, async () => {
    observed.push(now-start); now+=2000;
    return {status:201};
  },async()=>true,()=>now,async ms=>{now+=ms;});
  assert.deepEqual(observed,[15000,30000,45000]);
  assert.deepEqual(result,["accepted","accepted","accepted"]);
});

test("preview stops after admin is no longer authorized or endpoint is gone",async()=>{
  let now=100000;
  const plan=buildPreviewReminderPlan(now);
  let calls=0;
  assert.deepEqual(await runPreviewReminderPlan(plan,async()=>{
    calls++;return {status:410};
  },async()=>true,()=>now,async ms=>{now+=ms;}),["rejected"]);
  assert.equal(calls,1);
  now=100000;
  assert.deepEqual(await runPreviewReminderPlan(plan,async()=>{throw Error("must not send")},async()=>false,()=>now,async ms=>{now+=ms;}),[]);
});

test("preview uses existing setting and worker without opening the formal API or writing live data",()=>{
  const route=fs.readFileSync("app/api/background-reminders/preview/route.ts","utf8");
  const formal=fs.readFileSync("app/api/background-reminders/device/route.ts","utf8");
  const client=fs.readFileSync("lib/notifications/background-device-client.ts","utf8");
  const hook=fs.readFileSync("components/notification/useBackgroundReminders.ts","utf8");
  const page=fs.readFileSync("app/page.tsx","utf8");
  assert.match(route,/VERCEL_ENV !== "preview"/);
  assert.match(route,/VERCEL_GIT_COMMIT_REF !== "feature\/background-task-reminder-scheduler"/);
  assert.match(route,/ENABLE_BACKGROUND_REMINDER_PREVIEW !== "true"/);
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/sendBackgroundPush\(subscription, cue, keys\)/);
  assert.doesNotMatch(route,/\.rpc\(|\.from\(|getSupabaseAdminClient/);
  assert.match(formal,/if \(!backgroundRemindersEnabledEnvironment\(\)\)/);
  assert.match(client,/if \(input\.previewMode\) return/);
  assert.match(hook,/!formalKey && allowPreview/);
  assert.match(page,/allowPreview: isAdmin/);
  assert.match(page,/backgroundVibrationTest=\{backgroundReminder\.previewTest\}/);
});
