import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { canRetryReturnCueAfterGesture } from "../lib/voice/return-cue.ts";

const page = () => fs.readFileSync("app/page.tsx", "utf8");
const route = () => fs.readFileSync("app/api/voice/route.ts", "utf8");

test("only a single user-gesture retry follows iOS playback interruption", () => {
  assert.equal(canRetryReturnCueAfterGesture("NotAllowedError", 0, "visible"), true);
  assert.equal(canRetryReturnCueAfterGesture("AbortError", 0, "visible"), true);
  assert.equal(canRetryReturnCueAfterGesture("NotAllowedError", 1, "visible"), false);
  assert.equal(canRetryReturnCueAfterGesture("AbortError", 2, "visible"), false);
  assert.equal(canRetryReturnCueAfterGesture("NotAllowedError", 0, "hidden"), false);
  assert.equal(canRetryReturnCueAfterGesture("NetworkError", 0, "visible"), false);
  assert.equal(canRetryReturnCueAfterGesture("NotSupportedError", 0, "visible"), false);
  assert.equal(canRetryReturnCueAfterGesture(undefined, 0, "visible"), false);
});

test("return cue stays in existing voice queue and awaits actual playback result", () => {
  const source = page();
  assert.ok(source.includes('const [returnCueRetryText, setReturnCueRetryText] = useState<string | null>(null)'));
  assert.ok(source.includes('const isReturnCue = returnCueQueuedTextRef.current === nextText;'));
  assert.ok(source.includes('await playVoiceBlob(blob);'));
  assert.ok(source.includes('if (isReturnCue && returnCueQueuedTextRef.current === nextText)'));
  assert.ok(source.includes('setReturnCueRetryText(nextText);'));
  assert.ok(source.includes('voiceQueueRef.current = voiceQueueRef.current.filter(item => item !== previousReturnCue);'));
  assert.ok(source.includes('if (isLoading) return;'));
  assert.ok(source.includes('voiceAudioContextRef.current.state !== "running"'));
  assert.ok(source.includes('canRetryReturnCueAfterGesture('));
  assert.ok(source.includes('returnCueRetryCountRef.current += 1;'));
  assert.ok(source.includes('speak(returnCueRetryText, "return-retry");'));
  assert.ok(source.includes('document.addEventListener("pointerdown", retryAfterGesture, { passive: true })'));
  assert.ok(source.includes('document.removeEventListener("pointerdown", retryAfterGesture)'));
  assert.ok(source.includes("極簡任務提醒尚未播出，請輕觸畫面重試。"));
});

test("return cue stays opt-in, only external returns queue it, formal reminders remain primary", () => {
  const source = page();
  const detect = source.slice(
    source.indexOf('  // Only a real app/background return arms a one-off task cue.'),
    source.indexOf('  const displayCheckinName = authDisplayName;')
  );
  assert.ok(detect.includes('shouldQueueReturnCue(appWasInBackgroundRef.current, document.visibilityState)'));
  assert.ok(detect.includes('if (isVoiceEnabled) {'));
  assert.ok(detect.includes('activeTab !== "timeline"'));
  assert.ok(detect.includes('!isVoiceEnabled || !personalSettings.voiceReminderEnabled'));
  assert.ok(detect.includes('(!isAdmin && checkinStatus === "not_checked_in")'));
  assert.ok(detect.includes('(!isAdmin && isCurrentServiceVoiceClosed())'));
  assert.ok(detect.includes('voiceProcessingRef.current || voiceQueueRef.current.length > 0'));
  assert.ok(detect.includes('isNearFormalVoiceReminder('));
  assert.ok(detect.includes('speak(selected.kind === "current"'));
  assert.ok(detect.includes('"return");'));
  assert.ok(!detect.includes('announcedNodesRef.current.add'));
  assert.ok(source.includes('speak(buildReminderSpeechText(node, reminderType))'));
  assert.ok(source.includes('void playVoiceStartupConfirmation();'));
  assert.ok(source.includes('if (nextEnabled) {'));
});

test("turning voice off or closing service discards retry without changing check-in", () => {
  const source = page();
  const close = source.slice(source.indexOf('  const clearServiceVoiceQueue = () => {'), source.indexOf('  const stopVoiceAssistantForServiceEnd = () => {'));
  const toggle = source.slice(source.indexOf('  const handleToggleVoiceReminder = () => {'), source.indexOf('  useEffect(() => {\n    if (!isVoiceEnabled) return;', source.indexOf('  const handleToggleVoiceReminder = () => {')));
  for (const block of [close, toggle]) {
    assert.ok(block.includes('setReturnCuePendingAt(null)'));
    assert.ok(block.includes('setReturnCueRetryText(null)'));
    assert.ok(block.includes('returnCueQueuedTextRef.current = null'));
  }
  assert.ok(toggle.includes('setIsVoiceEnabled(nextEnabled)'));
  assert.ok(!toggle.includes('setCheckedInService('));
  assert.ok(toggle.includes('setPersonalSettings(prev => ({ ...prev, voiceReminderEnabled: nextEnabled }))'));
});

test("server-verified admins may use regular TTS outside service hours, no volunteer bypass", () => {
  const api = route();
  assert.ok(api.includes('const user = await requireActiveUser(request)'));
  const closedServiceGuard = api.slice(api.indexOf('if (!serviceOpen) {'), api.indexOf('const globalSettings = await getGlobalVoiceSettings()'));
  assert.ok(closedServiceGuard.includes('if (!canUseRegularVoiceWithoutCheckIn(user.roles)) {'));
  assert.ok(api.includes('if (!canUseRegularVoiceWithoutCheckIn(user.roles)) {'));
  assert.ok(api.includes('authorizeRegularVoice(request, user.userId, serviceType)'));
  assert.ok(api.includes('consumeRateLimit('));
  assert.ok(api.includes('if (!isPreview && !startupMaySkipCheckIn && !isServiceType(serviceType))'));
  const source = page();
  assert.ok(source.includes('(!isAdmin && isCurrentServiceVoiceClosed()) || !showLiveTimeline'));
});
