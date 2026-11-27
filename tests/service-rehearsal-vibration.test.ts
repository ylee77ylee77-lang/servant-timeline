import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeReminderPayload } from "../lib/notifications/background-push.ts";
import { dueRehearsalVibrationBlocks } from "../lib/voice/rehearsal-cues.ts";
import type { RehearsalParticipantState } from "../lib/services/rehearsal-participant-contract.ts";

test("rehearsal notifications contain only server-derived date, hall, time and marker", () => {
  const cue = { delivery_id:"00000000-0000-4000-8000-000000000001", service_date:"2030-01-03",
    service_type:"六晚崇", task_time:"19:00", scheduled_at:"2030-01-03T11:00:00Z", rehearsal:true };
  assert.deepEqual(JSON.parse(makeReminderPayload(cue)), {
    kind:"service-task-reminder-rehearsal",id:cue.delivery_id,date:cue.service_date,service:cue.service_type,time:cue.task_time,
  });
  assert.equal(JSON.parse(makeReminderPayload({...cue,rehearsal:false})).kind,"service-task-reminder");
});

test("foreground vibration groups simultaneous tasks, ignores voice toggle, and does not replay", () => {
  const due=Date.parse("2030-01-03T11:00:00Z");
  const state: RehearsalParticipantState = {
    rehearsal:{id:"practice",serviceType:"六晚崇",startedAt:new Date(due-360000).toISOString()},
    checkedInAt:new Date(due-60000).toISOString(),formalCheckIn:false,
    nodes:[1,2].map(i=>({id:String(i),dueAt:new Date(due).toISOString(),sortOrder:i,
      content:{title:"就位",location:null,assignee:null,details:null,voice_reminder_enabled:false,
        reminder_now_enabled:false,reminder_pre5_enabled:false,voice_pre5_simple:null,voice_pre5_standard:null,
        voice_pre5_detailed:null,voice_now_simple:null,voice_now_standard:null,voice_now_detailed:null},checklist:[]})),
  };
  const first=dueRehearsalVibrationBlocks(state,due,new Set());
  assert.equal(first.length,1);
  assert.equal(dueRehearsalVibrationBlocks(state,due,new Set([first[0].key])).length,0);
  assert.equal(dueRehearsalVibrationBlocks(state,due+15000,new Set()).length,0);
  assert.equal(dueRehearsalVibrationBlocks({...state,checkedInAt:null},due,new Set()).length,0);
  assert.equal(dueRehearsalVibrationBlocks({...state,formalCheckIn:true},due,new Set()).length,0);
  assert.equal(dueRehearsalVibrationBlocks({...state,checkedInAt:new Date(due+1).toISOString()},due+1,new Set()).length,0);
});

test("rehearsal uses the existing permission, worker, signed dispatcher and isolated RPC", () => {
  const read=(p:string)=>fs.readFileSync(p,"utf8");
  const device=read("app/api/background-reminders/device/route.ts");
  const dispatcher=read("app/api/background-reminders/dispatch/route.ts");
  const browser=read("lib/notifications/background-device-client.ts");
  const page=read("app/page.tsx");
  assert.match(device,/register_rehearsal_reminder_device/);
  assert.match(device,/p_rehearsal_id: body.rehearsalId/);
  assert.match(device,/disable_rehearsal_reminder_device/);
  assert.match(dispatcher,/validDispatcherAuthorization/);
  assert.match(dispatcher,/claim_rehearsal_reminders/);
  assert.match(dispatcher,/take_rehearsal_reminder/);
  assert.match(dispatcher,/finish_rehearsal_reminder/);
  assert.match(browser,/action: "register-rehearsal", rehearsalId: input.rehearsalId/);
  assert.match(browser,/action: "disable-rehearsal", endpoint: sub.endpoint/);
  assert.match(read("public/background-reminder-sw.js"),/夏凱納招待｜服事演練/);
  assert.match(page,/dueRehearsalVibrationBlocks\(rehearsal.current/);
  assert.match(page,/isAppleMobile\(\)\) return;/);
});
