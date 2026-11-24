import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = (path: string) => fs.readFileSync(path, "utf8");

test("live scheduled reminders allow verified admin outside service time, not volunteers", () => {
  const page = source("app/page.tsx");
  const start = page.indexOf("  // --- 【整合自動化】語音助理提醒核心觸發邏輯 ---");
  const end = page.indexOf("  const fetchData = async", start);
  assert.ok(start > 0 && end > start);
  const live = page.slice(start, end);
  assert.ok(live.includes('(!isAdmin && checkinStatus === "not_checked_in")'));
  assert.ok(live.includes("(!isAdmin && isCurrentServiceVoiceClosed())"));
  assert.ok(live.includes('!personalSettings.voiceReminderEnabled'));
  assert.ok(live.includes('isReminderDue(currentDate, node.time, 0)'));
  assert.ok(live.includes('isReminderDue(currentDate, node.time, leadSeconds)'));
  assert.ok(live.includes("announcedNodesRef.current.add(announceId)"));
  assert.ok(live.includes("speak(buildReminderSpeechText(node, reminderType))"));
});

test("admin quick and personal timed-test audio is requested before cue is due", () => {
  const card = source("components/voice/AdminVoiceTestCard.tsx");
  const start = card.indexOf("  const start = async () => {");
  const tick = card.indexOf("      const tick = () => {", start);
  const timer = card.indexOf("timerRef.current = window.setInterval(tick, 250)", tick);
  const prefetch = card.indexOf("      const prefetchCue = async (cue: AdminVoiceTestCue): Promise<AudioBuffer> => {", start);
  const playback = card.indexOf("      const playQueued = async () => {", prefetch);
  assert.ok(start >= 0 && prefetch > start && playback > prefetch && tick > playback && timer > tick);
  const preparation = card.slice(prefetch, playback);
  const playing = card.slice(playback, tick);
  assert.ok(preparation.includes('fetch("/api/voice"'));
  assert.ok(preparation.includes("Authorization: \"Bearer \" + accessToken"));
  assert.ok(preparation.includes("preview: true"));
  assert.ok(preparation.includes("const preparedAudio: Partial<Record<AdminVoiceTestCue, Promise<AudioBuffer>>>"));
  assert.ok(preparation.includes('prefetchCue("advance")'));
  assert.ok(preparation.includes('prefetchCue("ontime")'));
  assert.ok(preparation.includes("void Promise.allSettled(Object.values(preparedAudio))"));
  assert.ok(playing.includes("const prepared = preparedAudio[cue]"));
  assert.ok(playing.includes("const buffer = await prepared"));
  assert.ok(playing.includes("context.createBufferSource()"));
  assert.ok(!playing.includes('fetch("/api/voice"'), "never make a cold cloud request after the cue fired");
  assert.ok(playing.includes("playbackStartedAt: Date.now()"));
  assert.ok(playing.includes("playbackEndedAt: Date.now()"));
});

test("timed preview still cancels requests, protects check-in and keeps the same timer", () => {
  const card = source("components/voice/AdminVoiceTestCard.tsx");
  assert.ok(card.includes("abortRef.current?.abort()"));
  assert.ok(card.includes("prefetchController.signal.aborted"));
  assert.ok(card.includes("run !== runRef.current"));
  assert.ok(card.includes("createAdminVoiceTestPlan(new Date(), secondsBefore)"));
  assert.ok(card.includes("getAdminVoiceTestDue(time, testPlan)"));
  assert.ok(card.includes("timerRef.current = window.setInterval(tick, 250)"));
  assert.ok(card.includes('document.visibilityState') === false);
  assert.ok(!card.includes('fetch("/api/check-in"'));
  assert.ok(!card.includes("setCheckinStatus("));
  assert.ok(!card.includes("setNodes("));
});
