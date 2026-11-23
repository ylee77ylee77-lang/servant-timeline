import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = () => fs.readFileSync("app/page.tsx", "utf8");

test("formal reminder preempts both pending and currently playing startup audio", () => {
  const source = page();
  const start = source.indexOf("  const speak = (text: string) => {");
  const end = source.indexOf("  const testPreviewDeviceTone = async", start);
  assert.ok(start >= 0 && end > start);
  const speak = source.slice(start, end);
  assert.match(speak, /stopVoiceStartupConfirmation\(\);\s*voiceQueueRef\.current\.push\(cleanText\);\s*void processVoiceQueue\(\)/);

  const cancel = source.slice(
    source.indexOf("  const stopVoiceStartupConfirmation = useCallback(() => {"),
    source.indexOf("  const getVoiceStartupCacheKey =", source.indexOf("  const stopVoiceStartupConfirmation = useCallback(() => {"))
  );
  assert.ok(cancel.includes("voiceStartupRunRef.current += 1"));
  assert.ok(cancel.includes("voiceStartupRequestRef.current?.abort()"));
  assert.ok(cancel.includes("source.stop()"));
  assert.ok(cancel.includes("source.disconnect()"));
});

test("startup confirmation yields when formal speech is active or queued", () => {
  const source = page();
  const start = source.indexOf("  const playVoiceStartupConfirmation = async () => {");
  const end = source.indexOf("  const handleToggleVoiceReminder = () => {", start);
  assert.ok(start >= 0 && end > start);
  const confirmation = source.slice(start, end);
  assert.match(confirmation, /if \(voiceProcessingRef\.current \|\| voiceQueueRef\.current\.length > 0\) return;/);
  assert.ok(confirmation.includes("const decoded = await context.decodeAudioData(arrayBuffer)"));
  assert.match(confirmation, /if \(voiceProcessingRef\.current \|\| voiceQueueRef\.current\.length > 0\) \{\s*stopVoiceStartupConfirmation\(\);\s*return;/));
  assert.ok(confirmation.indexOf("stopVoiceStartupConfirmation();\n        return;") < confirmation.indexOf("source.start(context.currentTime)"));
});

test("formal schedule still queues the same task speech and current voice toggle stays unchanged", () => {
  const source = page();
  assert.ok(source.includes("speak(buildReminderSpeechText(node, reminderType))"));
  assert.ok(source.includes("void playVoiceStartupConfirmation();"));
  assert.ok(source.includes("onClick={handleToggleVoiceReminder}"));
  assert.ok(source.includes('setIsVoiceEnabled(nextEnabled);'));
});
