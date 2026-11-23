import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = () => fs.readFileSync("app/page.tsx", "utf8");

test("foreground recovery retries audio only when voice is on and page visible", () => {
  const source = page();
  const start = source.indexOf("  // A screen wake lock does not keep iOS JavaScript alive while hidden.");
  const end = source.indexOf("  // Only a real app/background return arms a one-off task cue.", start);
  assert.ok(start >= 0 && end > start);
  const recovery = source.slice(start, end);
  assert.ok(recovery.includes("if (!isVoiceEnabled) {"));
  assert.ok(recovery.includes('if (document.visibilityState !== "visible") return;'));
  assert.ok(recovery.includes('if (context && context.state !== "running")'));
  assert.ok(recovery.includes("context.resume()"));
  assert.ok(recovery.includes("voiceProcessingRef.current && audio?.paused && !audio.ended && audio.currentSrc"));
  assert.ok(recovery.includes("audio.play()"));
  assert.ok(recovery.includes('document.addEventListener("visibilitychange", onVisible)'));
  assert.ok(recovery.includes('window.addEventListener("pageshow", onVisible)'));
  assert.ok(recovery.includes('window.addEventListener("focus", onVisible)'));
  assert.ok(recovery.includes('document.addEventListener("pointerdown", onInteraction, { passive: true })'));
  assert.ok(recovery.includes("disposed = true"));
  assert.ok(recovery.includes('if (disposed || document.visibilityState !== "visible") return;'));
});

test("silent HTMLAudio unlock never interrupts a queued formal announcement", () => {
  const source = page();
  const start = source.indexOf("  const unlockVoiceHtmlAudio = async () => {");
  const end = source.indexOf("  useEffect(() => {", start);
  assert.ok(start >= 0 && end > start);
  const unlock = source.slice(start, end);
  assert.ok(unlock.includes("voiceProcessingRef.current || !audio.paused"));
  assert.ok(unlock.includes("audio.muted = true"));
  assert.ok(unlock.includes("voiceHtmlAudioUnlockedRef.current = true"));
  assert.ok(source.includes("if (isVoiceEnabled) voiceHtmlAudioUnlockedRef.current = false;"));
  assert.ok(source.includes("setCurrentDate(new Date());"));
  assert.ok(source.includes("setReturnCuePendingAt(Date.now());"));
});

test("existing screen wake lock and voice button remain, recovery notice appears only if needed", () => {
  const source = page();
  assert.ok(source.includes('wakeLockApi.request("screen")'));
  assert.ok(source.includes('if (document.visibilityState === "visible") {\n        void requestVoiceWakeLock();'));
  assert.ok(source.includes("isVoiceEnabled && voiceAudioRecoveryNeeded && ("));
  assert.ok(source.includes('role="status"'));
  assert.ok(source.includes("請輕觸畫面嘗試恢復"));
  assert.ok(source.includes("const warningTimer = window.setTimeout(() => {"));
  assert.ok(source.includes("}, 1500);"));
  assert.ok(source.includes("attempt === recoveryAttempt"));
  assert.ok(source.includes("window.clearTimeout(warningTimer)"));
  assert.ok(source.includes("onClick={handleToggleVoiceReminder}"));
  assert.ok(source.includes("setIsVoiceEnabled(nextEnabled);"));
  assert.ok(!source.includes('navigator.locks.request("keep_alive_lock"'));
});
