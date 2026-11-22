import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  VOICE_STARTUP_CONFIRMATION,
  canTestVoiceBeforeCheckIn,
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
  assert.ok(source.includes("consumeRateLimit(request, isPreview || isStartupTest)"));
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
  assert.ok(toggle.includes("void playVoiceStartupConfirmation();"));
  assert.ok(toggle.includes("stopVoiceStartupConfirmation();"));
  assert.ok(toggle.includes("void releaseVoiceWakeLock();"));
  assert.ok(source.includes("onClick={handleToggleVoiceReminder}"));
  assert.ok(source.includes('aria-pressed={isVoiceEnabled}'));
  assert.ok(source.includes('title={isVoiceEnabled ? `${VOICE_STARTUP_CONFIRMATION}'));
});

test("startup request sends no free-form speech and uses personal voice", () => {
  const source = page();
  const start = source.indexOf("  const playVoiceStartupConfirmation = async () => {");
  const end = source.indexOf("  const handleToggleVoiceReminder = () => {", start);
  assert.ok(start > 0 && end > start);
  const startup = source.slice(start, end);
  assert.ok(startup.includes("await context.resume()"));
  assert.ok(startup.indexOf("await context.resume()") < startup.indexOf('fetch("/api/voice"'));
  assert.ok(startup.includes("startupTest: true"));
  assert.ok(startup.includes("voiceProfile: personalSettings.voiceProfile"));
  assert.ok(startup.includes("serviceType: currentService"));
  assert.ok(!startup.includes("text: VOICE_STARTUP_CONFIRMATION"), "phrase must be fixed on server");
  assert.ok(startup.includes("signal: controller.signal"));
  assert.ok(startup.includes("context.decodeAudioData(arrayBuffer)"));
  assert.ok(startup.includes("source.start(context.currentTime)"));
});

test("closing voice or service cancels pending requests and active startup playback", () => {
  const source = page();
  const cancel = source.slice(
    source.indexOf("  const stopVoiceStartupConfirmation = () => {"),
    source.indexOf("  const playVoiceStartupConfirmation = async () => {")
  );
  assert.ok(cancel.includes("voiceStartupRunRef.current += 1"));
  assert.ok(cancel.includes("voiceStartupRequestRef.current?.abort()"));
  assert.ok(cancel.includes("source.stop()"));
  assert.ok(cancel.includes("source.disconnect()"));
  assert.ok(source.includes('if (runId !== voiceStartupRunRef.current || controller.signal.aborted) return;'));
  assert.ok(source.includes("const stopVoiceAssistantForServiceEnd = () => {\n    stopVoiceStartupConfirmation();"));
});

test("the current voice controls do not add another switch or confirmation dialog", () => {
  const source = page();
  const start = source.indexOf("  const playVoiceStartupConfirmation = async () => {");
  const end = source.indexOf("  useEffect(() => {\n    if (!isVoiceEnabled) return;", start);
  const workflow = source.slice(start, end);
  assert.ok(!workflow.includes('window.confirm('));
  assert.ok(!workflow.includes('setCheckedInService('));
  assert.ok(!workflow.includes('setPersonalSettings('));
  assert.ok(!workflow.includes('setVoiceSettingsDraft('));
  assert.ok(workflow.includes('請解除手機靜音模式、提高媒體音量'));
});
