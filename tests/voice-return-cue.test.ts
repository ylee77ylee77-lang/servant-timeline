import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  RETURN_CUE_LAST_TASK_GRACE_MINUTES,
  RETURN_CUE_REMINDER_GUARD_SECONDS,
  shouldQueueReturnCue,
  selectReturnCueTask,
  isNearFormalVoiceReminder,
} from "../lib/voice/return-cue.ts";

const at = (hour: number, minute: number, second = 0) => new Date(2026, 10, 22, hour, minute, second);
const tasks = [
  { id: "late", title: "晚間整理", time: "19:00" },
  { id: "early", title: "集合專招", time: "17:30" },
  { id: "mid", title: "崗位確認", time: "18:00" },
];

test("each external background-to-foreground return can cue immediately, without a duration threshold", () => {
  assert.equal(shouldQueueReturnCue(false, "visible"), false);
  assert.equal(shouldQueueReturnCue(false, "hidden"), false);
  assert.equal(shouldQueueReturnCue(true, "hidden"), false);
  assert.equal(shouldQueueReturnCue(true, "visible"), true);
  assert.equal(shouldQueueReturnCue(true, "prerender"), false);
});

test("current or next cue is selected from chronologically ordered valid task times", () => {
  assert.deepEqual(selectReturnCueTask(tasks, at(17, 0)), { task: tasks[1], kind: "next" });
  assert.deepEqual(selectReturnCueTask(tasks, at(17, 30)), { task: tasks[1], kind: "current" });
  assert.deepEqual(selectReturnCueTask(tasks, at(18, 30)), { task: tasks[2], kind: "current" });
  assert.deepEqual(selectReturnCueTask(tasks, at(19, 0)), { task: tasks[0], kind: "current" });
  assert.equal(RETURN_CUE_LAST_TASK_GRACE_MINUTES, 30);
  assert.deepEqual(selectReturnCueTask(tasks, at(19, 30)), { task: tasks[0], kind: "current" });
  assert.equal(selectReturnCueTask(tasks, at(19, 31)), null);
});

test("missing or malformed times never create an invented task cue", () => {
  assert.equal(selectReturnCueTask([], at(18, 0)), null);
  assert.equal(selectReturnCueTask([{ time: "25:00" }, { time: "" }, { time: "xx:00" }], at(18, 0)), null);
  assert.deepEqual(selectReturnCueTask([{ time: "18:03" }, { time: "18:03" }], at(18, 3)),
    { task: { time: "18:03" }, kind: "current" });
});

test("a return cue yields to a formal advance/on-time reminder around its due time", () => {
  assert.equal(RETURN_CUE_REMINDER_GUARD_SECONDS, 60);
  const oneTask = [{ time: "18:00" }];
  assert.equal(isNearFormalVoiceReminder(oneTask, at(17, 59, 0), 300, false, true), true);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(17, 59, 1), 300, false, true), true);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(18, 0, 15), 300, false, true), true);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(18, 0, 16), 300, false, true), false);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(17, 55), 300, true, false), true);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(17, 56, 1), 300, true, false), false);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(17, 59, 0), 300, false, false), false);
  assert.equal(isNearFormalVoiceReminder(oneTask, at(18, 0), 0, true, true), true);
});

test("scheduled reminder guard works across midnight and 15-second lead intervals", () => {
  const midnight = [{ time: "00:00" }];
  assert.equal(isNearFormalVoiceReminder(midnight, at(23, 59, 50), 0, false, true), true);
  assert.equal(isNearFormalVoiceReminder(midnight, at(23, 59, 45), 15, true, false), true);
  assert.equal(isNearFormalVoiceReminder(midnight, at(23, 58, 30), 15, true, false), false);
  assert.equal(isNearFormalVoiceReminder([{ time: "12:05" }], at(12, 4, 45), 15, true, false), true);
});

test("return-to-timeline integration reuses existing voice queue and never mutates reminders", () => {
  const source = fs.readFileSync("app/page.tsx", "utf8");
  assert.ok(source.includes('const [returnCuePendingAt, setReturnCuePendingAt] = useState<number | null>(null)'));
  assert.ok(source.includes('const appWasInBackgroundRef = useRef(false)'));
  assert.ok(!source.includes("previousActiveTabRef"));
  assert.ok(!source.includes("timelineAwayAtRef"));
  assert.ok(source.includes('document.addEventListener("visibilitychange", trackAppVisibility)'));
  assert.ok(source.includes('window.addEventListener("pagehide", markAppBackgrounded)'));
  assert.ok(source.includes('window.addEventListener("pageshow", handleAppForegrounded)'));
  assert.ok(source.includes('window.addEventListener("focus", handleAppForegrounded)'));
  assert.ok(source.includes('shouldQueueReturnCue(appWasInBackgroundRef.current, document.visibilityState)'));
  assert.ok(source.includes('appWasInBackgroundRef.current = false'));
  assert.ok(!source.includes("hasBeenAwayLongEnough"));
  assert.ok(!source.includes("isReturnCuePendingFresh"));
  const cue = source.slice(
    source.indexOf("  useEffect(() => {\n    if (returnCuePendingAt === null) return;"),
    source.indexOf("  const displayCheckinName = authDisplayName;")
  );
  assert.ok(cue.includes('activeTab !== "timeline"'));
  assert.ok(cue.includes('!isVoiceEnabled || !personalSettings.voiceReminderEnabled'));
  assert.ok(cue.includes('checkinStatus === "not_checked_in"'));
  assert.ok(cue.includes('!showLiveTimeline'));
  assert.ok(cue.includes('isCurrentServiceVoiceClosed()'));
  assert.ok(cue.includes('if (isLoading) return;'));
  assert.ok(cue.includes('voiceProcessingRef.current || voiceQueueRef.current.length > 0'));
  assert.ok(cue.includes('isNearFormalVoiceReminder('));
  assert.ok(cue.includes('selectReturnCueTask(filteredNodes, now)'));
  assert.ok(cue.includes('simplifyTaskPhrase(selected.task)'));
  assert.ok(cue.includes('const taskSpeech = selected.kind === "current"'));
  assert.ok(cue.includes('buildFirstCheckinTimelineSpeech(taskSpeech, VOICE_STARTUP_CONFIRMATION)'));
  assert.ok(cue.includes(': taskSpeech, "return")'));
  assert.ok(cue.includes('目前任務，'));
  assert.ok(cue.includes('下一個任務，'));
  assert.ok(!cue.includes('announcedNodesRef.current.add'));
  assert.ok(!cue.includes('setPersonalSettings('));
  assert.ok(!cue.includes('setCheckedInService('));
});
