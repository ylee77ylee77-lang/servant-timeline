import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildFirstCheckinTimelineSpeech } from "../lib/voice/return-cue.ts";
import { VOICE_STARTUP_CONFIRMATION } from "../lib/voice/startup-confirmation.ts";

const source = () => fs.readFileSync("app/page.tsx", "utf8");
const preferences = () => fs.readFileSync("components/profile/PersonalPreferencesCards.tsx", "utf8");

test("a fresh session reads the saved reminder preference before initializing assistant state", () => {
  const page = source();
  assert.ok(page.includes('const [isVoiceEnabled, setIsVoiceEnabled] = useState(false)'));
  assert.ok(page.includes("const voicePreferenceAppliedRef = useRef(false)"));
  assert.ok(page.includes("const [voicePreferenceInitialized, setVoicePreferenceInitialized] = useState(false)"));
  assert.ok(page.includes("window.localStorage.getItem(PERSONAL_REMINDER_STORAGE_KEY)"));
  assert.ok(page.includes("setPersonalSettingsLoaded(true)"));
  const start = page.indexOf('  // The reminder setting is the default for a new session.');
  const end = page.indexOf('  useEffect(() => {\n    if (!isVoiceEnabled) return;', start);
  assert.ok(start >= 0 && end > start);
  const boot = page.slice(start, end);
  assert.ok(boot.includes("if (!personalSettingsLoaded || voicePreferenceAppliedRef.current) return"));
  assert.ok(boot.includes("if (!personalSettings.voiceReminderEnabled)"));
  assert.ok(boot.includes('checkinStatus === "not_checked_in"'));
  assert.ok(boot.includes("!isServiceType(currentService) || isCurrentServiceVoiceClosed()"));
  assert.ok(boot.includes("setIsVoiceEnabled(true)"));
  assert.ok(!boot.includes("playVoiceStartupConfirmation()"), "no autoplay startup clip on hydration");
});

test("header manual voice toggle persists the user's choice and retains the startup confirmation", () => {
  const page = source();
  const start = page.indexOf("  const handleToggleVoiceReminder = () => {");
  const end = page.indexOf("  // The reminder setting is the default for a new session.", start);
  assert.ok(start >= 0 && end > start);
  const toggle = page.slice(start, end);
  assert.ok(toggle.includes("const nextEnabled = !isVoiceEnabled"));
  assert.ok(toggle.includes("voicePreferenceAppliedRef.current = true"));
  assert.ok(toggle.includes("setVoicePreferenceInitialized(true)"));
  assert.ok(toggle.includes("setPersonalSettings(prev => ({ ...prev, voiceReminderEnabled: nextEnabled }))"));
  assert.ok(toggle.includes("setIsVoiceEnabled(nextEnabled)"));
  assert.ok(toggle.includes("announceVoiceActivation()"));
  assert.ok(page.includes("const announceVoiceActivation = () => {"));
  assert.ok(toggle.includes("stopVoiceStartupConfirmation()"));
  assert.ok(toggle.includes("setReturnCueRetryText(null)"));
  assert.ok(toggle.includes("void releaseVoiceWakeLock()"));
});

test("reminder settings live switch matches assistant status without bypassing service gates", () => {
  const page = source();
  const start = page.indexOf("  const updatePersonalSettings = (patch: Partial<typeof personalSettings>) => {");
  const end = page.indexOf("  const normalizeText =", start);
  assert.ok(start >= 0 && end > start);
  const update = page.slice(start, end);
  assert.ok(update.includes("setPersonalSettings(prev => ({ ...prev, ...patch }))"));
  assert.ok(update.includes('typeof patch.voiceReminderEnabled !== "boolean"'));
  assert.ok(update.includes('checkinStatus === "not_checked_in"'));
  assert.ok(update.includes("!isServiceType(currentService) || isCurrentServiceVoiceClosed()"));
  assert.ok(update.includes("setIsVoiceEnabled(nextEnabled)"));
  assert.ok(update.includes("clearServiceVoiceQueue()"));
  assert.ok(update.includes("announceVoiceActivation()"));
  assert.ok(preferences().includes('label="語音助理"'));
  assert.ok(preferences().includes('onChange({ voiceReminderEnabled: !settings.voiceReminderEnabled })'));
});

test("successful formal or admin test check-in arms a one-off first timeline announcement", () => {
  const page = source();
  assert.ok(page.includes("firstCheckinTimelineCueServiceRef.current = lockedServiceType"));
  assert.ok(page.includes("firstCheckinTimelineCueServiceRef.current = testCheckInService"));
  assert.ok(page.includes("const openCheckedInTimeline = () => {"));
  assert.ok(page.includes('setActiveTab("timeline")'));
  const start = page.indexOf("  // One brief announcement on the first timeline visit after a verified");
  const end = page.indexOf("  // A rejected iOS media play is retried once after an actual gesture.", start);
  assert.ok(start >= 0 && end > start);
  const effect = page.slice(start, end);
  assert.ok(effect.includes('activeTab !== "timeline"'));
  assert.ok(effect.includes('checkinStatus !== "not_checked_in" && checkedInService === service'));
  assert.ok(effect.includes("isAdmin && completedTestCheckIn === service && currentService === service"));
  assert.ok(effect.includes("!personalSettingsLoaded || !voicePreferenceInitialized"));
  assert.ok(effect.includes("firstCheckinTimelineCueServiceRef.current = null"));
  assert.ok(effect.includes("!isVoiceEnabled || !personalSettings.voiceReminderEnabled"));
  assert.ok(effect.includes("returnCuePendingAt === null && !returnCueRetryText"));
  assert.ok(effect.includes("!returnCueQueuedTextRef.current && !voiceProcessingRef.current"));
  assert.ok(effect.includes("voiceQueueRef.current.length === 0"));
  assert.ok(effect.includes("setReturnCuePendingAt(Date.now())"));
  assert.ok(!effect.includes("setCheckinStatus("));
  assert.ok(!effect.includes("setCheckedInService("));
});

test("regular task reminders and background-return cues still use the existing shared queue", () => {
  const page = source();
  assert.ok(page.includes("speak(buildReminderSpeechText(node, reminderType))"));
  assert.ok(page.includes('const taskSpeech = buildReminderSpeechText('));
  assert.ok(page.includes('getTaskCueDetailLevel(trigger, personalSettings.voiceDetailLevel), null, selected.kind'));
  assert.ok(page.includes('buildFirstCheckinTimelineSpeech(taskSpeech, VOICE_STARTUP_CONFIRMATION)'));
  assert.ok(page.includes('shouldQueueReturnCue(appWasInBackgroundRef.current, document.visibilityState)'));
  assert.ok(page.includes('isNearFormalVoiceReminder('));
  assert.ok(page.includes('setReturnCueRetryText(nextText)'));
});

test("each verified first entry says activation before the brief current or next task in one clip", () => {
  assert.equal(
    buildFirstCheckinTimelineSpeech("目前任務，確認二樓入口站位。", VOICE_STARTUP_CONFIRMATION),
    "語音助理已開啟。 目前任務，確認二樓入口站位。"
  );
  assert.equal(
    buildFirstCheckinTimelineSpeech("下一個任務，準備迎賓。", VOICE_STARTUP_CONFIRMATION),
    "語音助理已開啟。 下一個任務，準備迎賓。"
  );
  assert.equal(buildFirstCheckinTimelineSpeech("", VOICE_STARTUP_CONFIRMATION), "");
  const page = source();
  const start = page.indexOf("  useEffect(() => {\n    if (returnCuePendingAt === null) return;");
  const end = page.indexOf("  // One brief announcement on the first timeline visit after a verified", start);
  assert.ok(start > 0 && end > start);
  const cue = page.slice(start, end);
  assert.ok(cue.includes('const isFirstCheckinEntry = trigger === "checkin"'));
  assert.ok(cue.includes('getTaskCueDetailLevel(trigger, personalSettings.voiceDetailLevel), null, selected.kind'));
  assert.ok(cue.includes("firstCheckinTimelineIntroServiceRef.current = null"));
  assert.ok(cue.includes("buildFirstCheckinTimelineSpeech(taskSpeech, VOICE_STARTUP_CONFIRMATION)"));
  assert.ok(cue.includes(": taskSpeech, \"return\")"));
  assert.ok(cue.includes('speak(VOICE_STARTUP_CONFIRMATION, "return")'), "if no actual task, confirm only");
  assert.ok(cue.includes("isNearFormalVoiceReminder("), "formal reminders still have priority");
});

test("first-entry greeting is armed once after check-in, cleared on voice off, and not repeated on background return", () => {
  const page = source();
  assert.ok(page.includes("firstCheckinTimelineIntroServiceRef.current = service"));
  assert.ok(page.includes('returnCueTriggerRef.current = "checkin"'));
  assert.ok(page.includes('returnCueTriggerRef.current = "foreground"'));
  assert.ok(page.includes("firstCheckinTimelineIntroServiceRef.current = null"));
  assert.ok(page.includes("firstCheckinTimelineCueServiceRef.current = lockedServiceType"));
  assert.ok(page.includes("firstCheckinTimelineCueServiceRef.current = testCheckInService"));
  assert.ok(page.includes('shouldQueueReturnCue(appWasInBackgroundRef.current, document.visibilityState)'));
  const normalReturn = page.slice(
    page.indexOf("  // Only a real app/background return arms a one-off task cue."),
    page.indexOf("  useEffect(() => {\n    if (returnCuePendingAt === null) return;")
  );
  assert.ok(!normalReturn.includes("firstCheckinTimelineIntroServiceRef.current = service"));
  const manualOff = page.slice(
    page.indexOf("  const handleToggleVoiceReminder = () => {"),
    page.indexOf("  // The reminder setting is the default for a new session.")
  );
  assert.ok(manualOff.includes("firstCheckinTimelineIntroServiceRef.current = null"));
  assert.ok(manualOff.includes("stopVoiceStartupConfirmation()"));
  assert.ok(page.includes("firstCheckinTimelineCueServiceRef.current = null"));
});

test("manual ON from either control says activation then eligible task without overlapping two players", () => {
  const page = source();
  const start = page.indexOf("  const announceVoiceActivation = () => {");
  const end = page.indexOf("  const handleToggleVoiceReminder = () => {", start);
  assert.ok(start > 0 && end > start);
  const activation = page.slice(start, end);
  const changeSettings = page.slice(
    page.indexOf("  const updatePersonalSettings = (patch: Partial<typeof personalSettings>) => {"),
    page.indexOf("  const normalizeText =", 0)
  );
  const toggle = page.slice(end, page.indexOf("  // The reminder setting is the default for a new session.", end));
  assert.ok(changeSettings.includes("announceVoiceActivation()"));
  assert.ok(toggle.includes("announceVoiceActivation()"));
  assert.ok(activation.includes("selectReturnCueTask(filteredNodes, now)"));
  assert.ok(activation.includes("personalSettings.voiceDetailLevel, null, selected.kind"));
  assert.ok(!activation.includes('getTaskCueDetailLevel("foreground"'), "activation must not be forced simple");
  assert.ok(activation.includes("buildFirstCheckinTimelineSpeech(taskSpeech, VOICE_STARTUP_CONFIRMATION)"));
  assert.ok(activation.includes('speak(buildFirstCheckinTimelineSpeech(taskSpeech, VOICE_STARTUP_CONFIRMATION), "return")'));
  assert.ok(!activation.includes("void playVoiceStartupConfirmation();\n      speak("), "no overlapping independent players");
  assert.ok(activation.includes("firstCheckinTimelineCueServiceRef.current = null"), "no duplicate greeting on first timeline visit");
});

test("manual ON respects normal check-in scope; no task retains the fixed startup audio", () => {
  const page = source();
  const begin = page.indexOf("  const announceVoiceActivation = () => {");
  const end = page.indexOf("  const handleToggleVoiceReminder = () => {", begin);
  const activation = page.slice(begin, end);
  assert.ok(activation.includes("isServiceType(currentService)"));
  assert.ok(activation.includes('checkinStatus !== "not_checked_in" && !isCurrentServiceVoiceClosed()'));
  assert.ok(activation.includes("isAdmin ||"));
  assert.ok(activation.includes("showLiveTimeline && !isLoading"));
  assert.ok(activation.includes("isNearFormalVoiceReminder("));
  assert.ok(activation.includes("void playVoiceStartupConfirmation()"), "fixed cached confirmation when no task");
  assert.ok(activation.includes("speak(VOICE_STARTUP_CONFIRMATION, \"return\")"), "queue behind an existing announcement");
  assert.ok(activation.includes("voiceProcessingRef.current || voiceQueueRef.current.length > 0"));
  assert.ok(!activation.includes("setCheckinStatus("));
  assert.ok(!activation.includes("setCheckedInService("));
  assert.ok(page.includes('shouldQueueReturnCue(appWasInBackgroundRef.current, document.visibilityState)'));
});
