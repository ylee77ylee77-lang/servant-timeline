import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeReminderPayload } from "../lib/notifications/background-push.ts";
import { dispatchBackgroundReminders } from "../lib/notifications/dispatch-reminders.ts";

test("admin test uses actual cue and the existing deduplicated transport", async () => {
  const cue = { delivery_id: "00000000-0000-0000-0000-000000000001", service_type: "六晚崇",
    service_date: "2030-01-03", task_time: "19:00", scheduled_at: "2030-01-03T11:00:00Z" };
  assert.equal(JSON.parse(makeReminderPayload(cue)).kind, "service-task-reminder");
  assert.deepEqual(JSON.parse(makeReminderPayload({...cue,adminTest:true})), {
    kind:"service-task-reminder-admin-test",id:cue.delivery_id,date:"2030-01-03",service:"六晚崇",time:"19:00",
  });
  let sends=0, finishes=0;
  const result=await dispatchBackgroundReminders({
    claim:async()=>[{delivery_id:cue.delivery_id},{delivery_id:cue.delivery_id}],
    take:async()=>({...cue,endpoint:"unused",p256dh:"unused",auth_secret:"unused"}),
    finish:async()=>{finishes++;return true;},
  },async()=>{sends++;return {status:201};});
  assert.equal(sends,1);assert.equal(finishes,1);assert.equal(result.accepted,1);
});
test("admin test is independently gated and only authorized by server", () => {
  const route=fs.readFileSync("app/api/background-reminders/device/route.ts","utf8");
  const config=fs.readFileSync("lib/notifications/background-config.ts","utf8");
  const hook=fs.readFileSync("components/notification/useBackgroundReminders.ts","utf8");
  const page=fs.readFileSync("app/page.tsx","utf8");
  assert.match(route,/adminTest && !user.roles.includes\("admin"\)/);
  assert.match(config,/ENABLE_ADMIN_TIMELINE_VIBRATION_TEST === "true"/);
  assert.match(config,/VERCEL_ENV === "production"/);
  assert.match(page,/adminTestService: isAdmin && activeTab === "timeline" \? currentService : ""/);
  assert.match(hook,/allowPreview \? await getBackgroundDeviceConfig\(accessToken, true\)/);
});
