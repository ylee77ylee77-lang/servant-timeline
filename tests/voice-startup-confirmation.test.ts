import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VOICE_STARTUP_CONFIRMATION,
  canTestVoiceBeforeCheckIn,
  canUseRegularVoiceWithoutCheckIn,
} from "../lib/voice/startup-confirmation.ts";

const page = () => fs.readFileSync("app/page.tsx", "utf8");
const route = () => fs.readFileSync("app/api/voice/route.ts", "utf8");

test("startup announcement is always the same short phrase", () => {
  assert.equal(VOICE_STARTUP_CONFIRMATION, "語音助理已開啟。");
  const source = page();
  assert.ok(source.includes("import { VOICE_STARTUP_CONFIRMATION }"));
  assert.ok(!source.includes("buildVoiceReminderStatusText"));
  assert.ok(!source.includes("getNextReminderInfo"));
  assert.ok(route().includes("isStartupTest ? VOICE_STARTUP_CONFIRMATION : normalizeSpeechText(body.text)"));
});

test("only coordinators and administrators may test before check-in", () => {
  assert.equal(canTestVoiceBeforeCheckIn(["coordinator"]), true);
  assert.equal(canTestVoiceBeforeCheckIn(["admin"]), true);
  assert.equal(canTestVoiceBeforeCheckIn(["volunteer", "coordinator"]), true);
  assert.equal(canTestVoiceBeforeCheckIn(["volunteer"]), false);
  assert.equal(canTestVoiceBeforeCheckIn(["leader"]), false);
  assert.equal(canTestVoiceBeforeCheckIn([]), false);
  const source = route();
  assert.ok(source.includes("const user = await requireActiveUser(request)"));
  assert.ok(source.includes("const startupMaySkipCheckIn = isStartupTest && canTestVoiceBeforeCheckIn(user.roles)"));
  assert.ok(source.includes("if (!isPreview && !startupMaySkipCheckIn && !isServiceType(serviceType))"));
  assert.ok(source.includes("if (!isPreview && !startupMaySkipCheckIn && isServiceType(serviceType))"));
  assert.ok(source.includes("authorizeRegularVoice(request, user.userId, serviceType)"));
  assert.ok(source.includes("if (isStartupTest && isPreview)"));
  assert.ok(source.includes('consumeRateLimit(request, isPreview || isStartupTest, isStartupTest ? user.userId : "")'));
  assert.ok(source.includes('userScope || "shared"'));
  assert.ok(source.includes('isStartupTest ? "startup" : isPreview ? "preview" : "regular"'));
  assert.ok(source.includes("if (isPreview && !user.roles.includes(\"admin\"))"));
});

test("existing voice button stays in place and confirms each transition to ON", () => {
  const source = page();
  const start = source.indexOf("  const handleToggleVoiceReminder = () => {");
  const end = source.indexOf("  useEffect(() => {\n    if (!isVoiceEnabled) return;", start);
  assert.ok(start > 0 && end > start);
  const toggle = source.slice(start, end);
  assert.ok(toggle.includes("const nextEnabled = !isVoiceEnabled;"));
  assert.ok(toggle.includes("setIsVoiceEnabled(nextEnabled);"));
  assert.ok(toggle.includes("if (nextEnabled) {"));
  assert.ok(toggle.includes("announceVoiceActivation();"));
  assert.ok(source.includes("const announceVoiceActivation = () => {"));
  assert.ok(source.includes("void playVoiceStartupConfirmation();"));
  assert.ok(toggle.includes("stopVoiceStartupConfirmation();"));
  assert.ok(toggle.includes("void releaseVoiceWakeLock();"));
  assert.ok(source.includes("onClick={handleToggleVoiceReminder}"));
  assert.ok(source.includes('aria-pressed={isVoiceEnabled}'));
  assert.ok(source.includes('title={isVoiceEnabled ? `${VOICE_STARTUP_CONFIRMATION}'));
});

test("startup request sends no free-form speech and uses personal voice", () => {
  const source = page();
  const requestStart = source.indexOf("  const fetchVoiceStartupBlob = async (");
  const start = source.indexOf("  const playVoiceStartupConfirmation = async () => {");
  const end = source.indexOf("  const handleToggleVoiceReminder = () => {", start);
  assert.ok(requestStart > 0 && start > requestStart && end > start);
  const request = source.slice(requestStart, start);
  const startup = source.slice(start, end);
  assert.ok(startup.includes("await context.resume()"));
  assert.ok(request.includes('fetch("/api/voice"'));
  assert.ok(request.includes("startupTest: true"));
  assert.ok(request.includes("voiceProfile: personalSettings.voiceProfile"));
  assert.ok(request.includes("serviceType: currentService"));
  assert.ok(!request.includes("text: VOICE_STARTUP_CONFIRMATION"), "phrase must be fixed on server");
  assert.ok(request.includes("signal"));
  assert.ok(startup.includes("context.decodeAudioData(arrayBuffer)"));
  assert.ok(startup.includes("source.start(context.currentTime)"));
});

test("closing voice or service cancels pending requests and active startup playback", () => {
  const source = page();
  const cancel = source.slice(
    source.indexOf("  const stopVoiceStartupConfirmation = useCallback(() => {"),
    source.indexOf("  const playVoiceStartupConfirmation = async () => {")
  );
  assert.ok(cancel.includes("voiceStartupRunRef.current += 1"));
  assert.ok(cancel.includes("voiceStartupRequestRef.current?.abort()"));
  assert.ok(cancel.includes("source.stop()"));
  assert.ok(cancel.includes("source.disconnect()"));
  assert.ok(source.includes("useEffect(() => () => stopVoiceStartupConfirmation(), [stopVoiceStartupConfirmation])"));
  assert.ok(source.includes('if (runId !== voiceStartupRunRef.current || controller.signal.aborted) return;'));
  assert.ok(source.includes("const stopVoiceAssistantForServiceEnd = () => {\n    clearServiceVoiceQueue();"));
  const clearQueue = source.slice(source.indexOf("const clearServiceVoiceQueue"), source.indexOf("const stopVoiceAssistantForServiceEnd"));
  assert.ok(clearQueue.includes("stopVoiceStartupConfirmation();"));
});

test("the current voice controls do not add another switch or confirmation dialog", () => {
  const source = page();
  const start = source.indexOf("  const playVoiceStartupConfirmation = async () => {");
  const end = source.indexOf("  useEffect(() => {\n    if (!isVoiceEnabled) return;", start);
  const workflow = source.slice(start, end);
  assert.ok(!workflow.includes('window.confirm('));
  assert.ok(!workflow.includes('setCheckedInService('));
  // A voice toggle now persists just its own reminder setting; it never mutates check-in or other settings.
  assert.ok(workflow.includes('setPersonalSettings(prev => ({ ...prev, voiceReminderEnabled: nextEnabled }))'));
  assert.ok(!workflow.includes('setVoiceSettingsDraft('));
  assert.ok(workflow.includes('請解除手機靜音模式、提高媒體音量'));
});

test("startup audio prefetches after auth, respects role/check-in, and reuses local cache", () => {
  const source = page();
  const start = source.indexOf("  const getVoiceStartupCacheKey = () =>");
  const end = source.indexOf("  const handleToggleVoiceReminder = () => {", start);
  assert.ok(start > 0 && end > start);
  const workflow = source.slice(start, end);
  assert.ok(workflow.includes('createVoiceCacheId(VOICE_STARTUP_CONFIRMATION, getVoiceProfile())'));
  assert.ok(workflow.includes("personalSettingsLoaded"));
  assert.ok(workflow.includes("session.access_token"));
  assert.ok(workflow.includes('checkinStatus !== "not_checked_in"'));
  assert.ok(workflow.includes('storage.match(cacheUrl)'));
  assert.ok(workflow.includes('caches.open(VOICE_AUDIO_CACHE_NAME)'));
  assert.ok(workflow.includes('voiceStartupPreloadRef.current?.promise'));
  assert.ok(workflow.includes('voiceStartupCachedClipRef.current?.key === key'));
  assert.ok(workflow.includes('blob = await fetchVoiceStartupBlob(key, controller.signal)'));
  assert.ok(!workflow.includes("setCheckedInService("));
  assert.ok(!workflow.includes("announcedNodesRef.current.add"));
});

test("formal reminder schedule remains global across in-app pages", () => {
  const source = page();
  const scheduleStart = source.indexOf("  // --- 【整合自動化】語音助理提醒核心觸發邏輯 ---");
  const scheduleEnd = source.indexOf("  const fetchData = async", scheduleStart);
  const schedule = source.slice(scheduleStart, scheduleEnd);
  assert.ok(schedule.includes("if (!isVoiceEnabled"));
  assert.ok(schedule.includes("speak(buildReminderSpeechText(node, reminderType))"));
  assert.ok(!schedule.includes('activeTab !== "timeline"'), "formal speech must not depend on timeline page");
  assert.ok(!schedule.includes('activeTab === "timeline"'), "formal speech must not depend on timeline page");
});

test("admin has the coordinator startup confirmation and live speech without check-in", () => {
  assert.equal(canTestVoiceBeforeCheckIn(["admin"]), true);
  assert.equal(canUseRegularVoiceWithoutCheckIn(["admin"]), true);
  assert.equal(canUseRegularVoiceWithoutCheckIn(["coordinator"]), false);
  assert.equal(canUseRegularVoiceWithoutCheckIn(["volunteer"]), false);
  assert.equal(canUseRegularVoiceWithoutCheckIn([]), false);
  assert.equal(canUseRegularVoiceWithoutCheckIn(["volunteer", "admin"]), true);

  const source = page();
  const api = route();
  assert.ok(source.includes('if (nextEnabled && !isAdmin && isCurrentServiceVoiceClosed())'));
  assert.ok(source.includes('if (!isAdmin && isCurrentServiceVoiceClosed())'));
  assert.ok(source.includes('(!isAdmin && checkinStatus === "not_checked_in")'));
  assert.ok(source.includes('(!isAdmin && (!isServiceType(currentService) || isCurrentServiceVoiceClosed()))'));
  assert.ok(api.includes('if (!canUseRegularVoiceWithoutCheckIn(user.roles)) {'));
  assert.ok(api.includes("const isAuthorized = await authorizeRegularVoice(request, user.userId, serviceType);"));
  assert.ok(api.includes("const user = await requireActiveUser(request);"));
  assert.ok(api.includes("const current = await ensureCurrentServices();"));
  assert.ok(api.includes("if (!serviceOpen)"));
  assert.ok(api.includes(": current.activeServiceTypes.includes(serviceType)"));
});

test("admin live speech and return cues are not gated by check-in; coordinator still is", () => {
  const source = page();
  const start = source.indexOf("  // --- 【整合自動化】語音助理提醒核心觸發邏輯 ---");
  const end = source.indexOf("  const fetchData = async", start);
  const live = source.slice(start, end);
  assert.ok(live.includes('(!isAdmin && checkinStatus === "not_checked_in")'));
  assert.ok(live.includes("isCurrentServiceVoiceClosed()"));
  assert.ok(live.includes("isVoiceEnabled"));
  assert.ok(live.includes("speak(buildReminderSpeechText(node, reminderType))"));
  const cueStart = source.indexOf('  useEffect(() => {\n    if (returnCuePendingAt === null) return;');
  const cueEnd = source.indexOf("  const displayCheckinName = authDisplayName;", cueStart);
  assert.ok(cueStart > 0 && cueEnd > cueStart);
  const cue = source.slice(cueStart, cueEnd);
  assert.ok(cue.includes('(!isAdmin && checkinStatus === "not_checked_in")'));
  assert.ok(cue.includes('isCurrentServiceVoiceClosed()'));
  assert.ok(!cue.includes("announcedNodesRef.current.add"));
});
