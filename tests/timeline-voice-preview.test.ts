import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = () => fs.readFileSync("app/page.tsx", "utf8");

test("timeline displays the start time in soft grey above each marker without replacing the live red cursor", () => {
  const source = page();
  assert.ok(source.includes('className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium leading-none tabular-nums text-[#9CA3AF]"'));
  assert.ok(source.includes("{node.time}\n                    </span>"));
  assert.ok(source.includes('rounded-full border-[3px] border-[#E6EAF0] bg-white'));
  assert.ok(source.includes('bg-[#F25D6B] animate-ping'));
  assert.ok(source.includes('showLiveTimeline && currentTimeCursorTop !== null'));
});

test("admin preview reuses real reminder wording for both timing and all detail levels", () => {
  const source = page();
  assert.ok(source.includes('const buildReminderSpeechText = (node: any, reminderType: "pre5" | "now", detailLevel: ReminderDetailLevel = personalSettings.voiceDetailLevel)'));
  assert.ok(source.includes('const detailHint = buildDetailedVoiceHint(node, detailLevel);'));
  assert.ok(source.includes('const text = buildReminderSpeechText(node, timelinePreviewTiming, timelinePreviewDetail);'));
  assert.ok(source.includes('{buildReminderSpeechText(node, timelinePreviewTiming, timelinePreviewDetail)}'));
  assert.ok(source.includes('buildReminderSpeechText(node, reminderType)'));
  assert.ok(source.includes('<option value="pre5">提前 5 分鐘</option>'));
  assert.ok(source.includes('<option value="now">準點提醒</option>'));
  for (const level of ["simple", "standard", "detailed"]) {
    assert.ok(source.includes(`<option value="${level}">`));
  }
});

test("only administrators can see and request preview audio; preview is independent from live reminders", () => {
  const source = page();
  const api = fs.readFileSync("app/api/voice/route.ts", "utf8");
  assert.ok(source.includes('{isAdmin && (\n                        <button'));
  assert.ok(source.includes('aria-expanded={timelinePreviewNodeId === node.id}'));
  assert.ok(source.includes('if (!isAdmin) return;\n    stopTimelinePreviewAudio();'));
  assert.ok(source.includes('preview: true,'));
  assert.ok(source.includes('voiceProfile: personalSettings.voiceProfile'));
  assert.ok(api.includes('if (isPreview && !user.roles.includes("admin"))'));
  const start = source.indexOf('  const playTimelinePreviewAudio = async (node: any) => {');
  const end = source.indexOf('  // Closing the timeline or switching services', start);
  assert.ok(start > 0 && end > start);
  const playback = source.slice(start, end);
  for (const forbidden of ["voiceQueueRef", "announcedNodesRef", "setCurrentService(", "setCheckedInService(", "toggleChecklist(", "setNodes("]) {
    assert.ok(!playback.includes(forbidden), `preview must not change ${forbidden}`);
  }
  assert.ok(playback.includes('context.createBufferSource()'));
  assert.ok(playback.includes('signal: controller.signal'));
  assert.ok(playback.includes('timelinePreviewRunRef.current !== runId'));
  assert.ok(source.includes('timelinePreviewRequestRef.current?.abort()'));
  assert.ok(source.includes('source.stop()'));
});
