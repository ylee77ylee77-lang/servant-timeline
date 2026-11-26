import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPreviewTaskPushPlan, runPreviewTaskPushPlan, PREVIEW_TASK_TTL_SECONDS } from "../lib/notifications/preview-task-push-plan.ts";

test("server creates three distinct fixed task times", () => {
  const plan = createPreviewTaskPushPlan(100_000);
  assert.deepEqual(plan, [{task:1,dueAt:115_000},{task:2,dueAt:130_000},{task:3,dueAt:145_000}]);
  assert.equal(PREVIEW_TASK_TTL_SECONDS,15);
  assert.throws(() => createPreviewTaskPushPlan(NaN));
});

test("server uses absolute due times without accumulating transport delay", async () => {
  let now = 100_000;
  const observed: number[] = [];
  const plan = createPreviewTaskPushPlan(now);
  const results = await runPreviewTaskPushPlan(plan, async () => {
    observed.push(now);
    now += 8_000;
    return {ok:true,status:201};
  }, () => now, async ms => { now += ms; });
  assert.deepEqual(observed,[115_000,130_000,145_000]);
  assert.deepEqual(results.map(r=>r.state),["accepted","accepted","accepted"]);
});

test("expired and duplicate tasks are skipped; rejection and uncertain sends are not retried", async () => {
  let now = 121_000;
  const plan = createPreviewTaskPushPlan(100_000);
  const attempted: number[] = [];
  const results = await runPreviewTaskPushPlan([plan[0],plan[1],plan[1],plan[2]], async cue => {
    attempted.push(cue.task);
    if(cue.task===2) throw new Error("network failure");
    return {ok:false,status:410};
  },()=>now,async ms=>{now+=ms;});
  assert.deepEqual(attempted,[2,3]);
  assert.deepEqual(results.map(r=>r.state),["expired","uncertain","rejected"]);
});

test("test sequence remains gated by preview, admin, explicit opt-in and fixed server plan", () => {
  const route = fs.readFileSync("app/api/notification-test/server-push/route.ts","utf8");
  const ui = fs.readFileSync("components/notification/ServerPushTest.tsx","utf8");
  const worker = fs.readFileSync("public/notification-test-sw.js","utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/process\.env\.VERCEL_ENV !== "preview"/);
  assert.match(route,/mode === "sequence" && body\.vibrationEnabled !== true/);
  assert.match(route,/createPreviewTaskPushPlan\(now\)/);
  assert.match(route,/runPreviewTaskPushPlan\(plan/);
  assert.match(route,/PREVIEW_TASK_TTL_SECONDS/);
  assert.match(ui,/!prepared \|\| busy \|\| submitted \|\| !vibrationEnabled/);
  assert.match(ui,/mode: "sequence", vibrationEnabled: true/);
  assert.match(worker,/tag: "shekinah-notification-test-" \+ self\.crypto\.randomUUID\(\)/);
  assert.doesNotMatch(worker,/vibrate\(|addEventListener\("fetch"/);
});
