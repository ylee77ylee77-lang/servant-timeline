import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ADMIN_TEST_QUICK_LEAD_SECONDS,
  ADMIN_TEST_START_WAIT_SECONDS,
  createAdminVoiceTestPlan,
  getAdminVoiceTestDue,
} from "../lib/voice/admin-test-plan.ts";

const page = () => fs.readFileSync("app/page.tsx", "utf8");
const card = () => fs.readFileSync("components/voice/AdminVoiceTestCard.tsx", "utf8");
const route = () => fs.readFileSync("app/api/voice/route.ts", "utf8");

test("quick test is clock-driven using the same live due helper", () => {
  const now = new Date(2026, 10, 23, 18, 15, 0);
  const plan = createAdminVoiceTestPlan(now, ADMIN_TEST_QUICK_LEAD_SECONDS);
  assert.equal(ADMIN_TEST_QUICK_LEAD_SECONDS, 15);
  assert.equal(ADMIN_TEST_START_WAIT_SECONDS, 20);
  assert.equal(plan.dueAt - now.getTime(), 35_000);
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 19_000), plan), {
    advance: false, ontime: false,
  });
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 20_000), plan), {
    advance: true, ontime: false,
  });
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 23_000), plan), {
    advance: false, ontime: false,
  });
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 35_000), plan), {
    advance: false, ontime: true,
  });
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 39_000), plan), {
    advance: false, ontime: false,
  });
});

test("personal lead interval, including seconds, produces both reminders at correct times", () => {
  const now = new Date(2026, 10, 23, 20, 44, 1);
  const plan = createAdminVoiceTestPlan(now, 3 * 60 + 30);
  assert.equal(plan.dueAt - now.getTime(), 230_000);
  assert.equal(getAdminVoiceTestDue(new Date(now.getTime() + 20_000), plan).advance, true);
  assert.equal(getAdminVoiceTestDue(new Date(now.getTime() + 229_000), plan).ontime, false);
  assert.equal(getAdminVoiceTestDue(new Date(now.getTime() + 230_000), plan).ontime, true);
});

test("0-second lead and midnight rollover remain deterministic", () => {
  const now = new Date(2026, 10, 23, 23, 59, 45);
  const plan = createAdminVoiceTestPlan(now, 15);
  assert.equal(plan.taskTime, "00:00:20");
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 20_000), plan), {
    advance: true, ontime: false,
  });
  assert.equal(getAdminVoiceTestDue(new Date(now.getTime() + 35_000), plan).ontime, true);
  const zero = createAdminVoiceTestPlan(now, 0);
  assert.deepEqual(getAdminVoiceTestDue(new Date(now.getTime() + 20_000), zero), {
    advance: true, ontime: true,
  });
});

test("invalid test plan input cannot create unbounded timers", () => {
  assert.throws(() => createAdminVoiceTestPlan(new Date("invalid"), 15));
  assert.throws(() => createAdminVoiceTestPlan(new Date(), -1));
  assert.throws(() => createAdminVoiceTestPlan(new Date(), 3646));
  assert.throws(() => createAdminVoiceTestPlan(new Date(), 15, 1));
  assert.throws(() => createAdminVoiceTestPlan(new Date(), 15, 61));
});

test("admin test is only rendered for an admin and uses the existing formal speech builder", () => {
  const source = page();
  const placement = source.indexOf("<AdminVoiceTestCard");
  assert.ok(placement > 0);
  assert.ok(source.slice(placement - 90, placement).includes("isCurrentUserAdmin &&"));
  const testProps = source.slice(placement, placement + 1000);
  assert.ok(testProps.includes("session.access_token"));
  assert.ok(testProps.includes("buildReminderSpeechText(testNode"));
  assert.ok(testProps.includes("getReminderLeadSeconds("));
  assert.ok(testProps.includes("personalSettings.reminderPre5Enabled"));
  assert.ok(testProps.includes("personalSettings.reminderNowEnabled"));
});

test("test audio is server-authorized as preview; regular service restrictions remain intact", () => {
  const source = card();
  const api = route();
  assert.ok(source.includes('fetch("/api/voice"'));
  assert.ok(source.includes("preview: true"));
  assert.ok(!source.includes("startupTest: true"));
  assert.ok(source.includes("context.resume()"));
  assert.ok(source.includes("createAdminVoiceTestPlan(new Date(), secondsBefore)"));
  assert.ok(source.includes("getAdminVoiceTestDue(time, testPlan)"));
  assert.ok(source.includes("source.start(context.currentTime)"));
  for (const unsafeWrite of [
    "setNodes(", "setCheckinStatus(", "announcedNodesRef", "voiceQueueRef",
    'fetch("/api/check-in"', 'fetch("/api/timeline-nodes"',
  ]) assert.ok(!source.includes(unsafeWrite), "test must not touch " + unsafeWrite);
  assert.ok(api.includes('if (isPreview && !user.roles.includes("admin"))'));
  assert.ok(api.includes("const user = await requireActiveUser(request)"));
  assert.ok(api.includes("const current = await ensureCurrentServices()"));
  assert.ok(api.includes("if (!current.activeServiceTypes.includes(serviceType))"));
});

test("test cleanup cancels timer, voice network requests and active playback", () => {
  const source = card();
  assert.ok(source.includes("runRef.current += 1"));
  assert.ok(source.includes("clearInterval(timerRef.current)"));
  assert.ok(source.includes("abortRef.current?.abort()"));
  assert.ok(source.includes("source.stop()"));
  assert.ok(source.includes("void context.close().catch(() => {})"));
  assert.ok(source.includes("timerRef.current = window.setInterval(tick, 250)"));
  assert.ok(source.includes("document.visibilityState") === false);
});

test("off-hours test does not depend on check-in, service dates or the live reminder switch", () => {
  const source = card();
  assert.ok(!source.includes("checkinStatus"));
  assert.ok(!source.includes("getServiceActivationState"));
  assert.ok(!source.includes("isCurrentServiceVoiceClosed"));
  assert.ok(!source.includes("setIsVoiceEnabled"));
  assert.ok(source.includes('preview: true'));
  assert.ok(source.includes('aria-label="管理員即時語音測試"'));
});

test("diagnostics report scheduled trigger and actual playback separately", () => {
  const source = card();
  assert.ok(source.includes('expectedAt: testPlan.dueAt - secondsBefore * 1000'));
  assert.ok(source.includes('expectedAt: testPlan.dueAt, triggeredAt: time.getTime()'));
  assert.ok(source.includes('playbackStartedAt: Date.now()'));
  assert.ok(source.includes('playbackEndedAt: Date.now()'));
  assert.ok(source.includes("預定觸發"));
  assert.ok(source.includes("實際觸發"));
  assert.ok(source.includes("播放器開始"));
  assert.ok(source.includes("不能證明手機喇叭或耳機實際有聲音"));
  assert.ok(!source.includes("已完成播放</div>"));
});

test("an interrupted test cancels an in-flight playback and settles its promise", () => {
  const source = card();
  assert.ok(source.includes("finishPlaybackRef.current = finish"));
  assert.ok(source.includes("finishPlaybackRef.current = null;"));
  assert.ok(source.includes("finish?.()"));
  assert.ok(source.includes("source.onended = null"));
  assert.ok(source.includes("queuedRef.current.length > 0) void playQueued()"));
});

test("quick and personal test announce the same lead interval used by the test clock", () => {
  const source = card();
  const app = page();
  assert.ok(source.includes('buildSpeech("advance", testPlan.taskTime, selectedTitle, detailLevel, testPlan.leadSeconds)'));
  assert.ok(source.includes('buildSpeech("ontime", testPlan.taskTime, selectedTitle, detailLevel, testPlan.leadSeconds)'));
  assert.ok(app.includes("leadSecondsOverride: number | null = null"));
  assert.ok(app.includes("const effectiveLeadSeconds = leadSecondsOverride ??"));
  assert.ok(app.includes("Math.floor(effectiveLeadSeconds / 60), effectiveLeadSeconds % 60"));
  assert.ok(app.includes("if (effectiveLeadSeconds === 0)"));
  assert.ok(app.includes('buildSpeech={(cue, taskTime, title, detail, leadSeconds) =>'));
  assert.ok(app.includes('testNode, cue === "advance" ? "pre5" : "now", detail, leadSeconds'));
});
