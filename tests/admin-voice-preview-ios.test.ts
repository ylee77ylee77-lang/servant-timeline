import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const readPage = () => fs.readFileSync("app/page.tsx", "utf8");

const previewFunction = () => {
  const source = readPage();
  const start = source.indexOf("  const previewVoiceDraft = async () => {");
  const end = source.indexOf("  // --- Gemini API", start);
  assert.ok(start > 0 && end > start, "preview function must remain defined");
  return source.slice(start, end);
};

test("administrator voice preview keeps distinct Google voice profiles and existing admin authorization", () => {
  const preview = previewFunction();
  const route = fs.readFileSync("app/api/voice/route.ts", "utf8");
  assert.ok(preview.includes('const voiceLabel = isMale ? "男聲 Iapetus" : "女聲 Zephyr";'));
  assert.ok(preview.includes('voiceProfile: isMale ? "iapetus" : "zephyr"'));
  assert.ok(preview.includes('preview: true,'));
  assert.ok(preview.includes('Authorization: `Bearer ${session.access_token}`'));
  assert.ok(route.includes('if (isPreview && !user.roles.includes("admin"))'));
});

test("preview resumes WebAudio at tap time before fetching TTS", () => {
  const preview = previewFunction();
  const resume = preview.indexOf("await ctx.resume()");
  const network = preview.indexOf('fetch("/api/voice"');
  const playback = preview.indexOf("await playVoiceBuffer(decoded)");
  assert.ok(resume >= 0 && network > resume && playback > network);
  assert.doesNotMatch(preview, /await unlockVoiceHtmlAudio\(\)/);
  assert.doesNotMatch(preview, /await playVoiceBlob\(blob\)/);
  assert.ok(preview.includes('ctx.state !== "running"'));
});

test("successful MP3 synthesis always provides explicit native iOS playback controls", () => {
  const source = readPage();
  const preview = previewFunction();
  assert.ok(preview.includes('response.headers.get("Content-Type")'));
  assert.ok(preview.includes("blob.size === 0"));
  assert.ok(preview.includes('setVoicePreviewClip({ url: URL.createObjectURL(blob), label: voiceLabel });'));
  assert.ok(source.includes("const [voicePreviewClip, setVoicePreviewClip] = useState"));
  assert.ok(source.includes("URL.revokeObjectURL(voicePreviewClip.url)"));
  assert.ok(source.includes('key={voicePreviewClip.url}'));
  assert.ok(source.includes('<audio'));
  assert.ok(source.includes("preload=\"metadata\""));
  assert.ok(source.includes("controls"));
  assert.ok(source.includes('src={voicePreviewClip.url}'));
  assert.ok(source.includes("若無聲音，請比較"));
});

test("preview synthesis and playback failures are not silent or mistaken for success", () => {
  const preview = previewFunction();
  assert.ok(preview.includes('雲端請求 HTTP ${response.status}：${payload?.error || "試聽語音產生失敗"}'));
  assert.ok(preview.includes("雲端語音沒有傳回有效音檔"));
  assert.ok(preview.includes("語音音檔已產生，但自動播放受限"));
  assert.ok(preview.includes('setCustomAlert({ isOpen: true, message: err?.message || "試聽語音失敗，請稍後再試。" })'));
});

test("voice preview reminds iPhone users to check silent mode and media volume", () => {
  const source = readPage();
  assert.ok(source.includes("試聽前請確認媒體音量；支援的 iPhone 可嘗試在靜音模式下播報。"));
  const previewButton = source.indexOf('{isVoicePreviewing ? "試聽中" : "試聽 Zephyr / Iapetus"}');
  const hint = source.indexOf("試聽前請確認手機未開啟靜音模式");
  const deviceTest = source.indexOf("測試手機音效（不使用雲端）");
  assert.ok(previewButton >= 0 && hint > previewButton && deviceTest > hint);
});

test("device tone isolates local audio output from cloud TTS", () => {
  const source = readPage();
  const start = source.indexOf('  const testPreviewDeviceTone = async () => {');
  const end = source.indexOf('  const previewVoiceDraft = async () => {', start);
  assert.ok(start > 0 && end > start, "local audio test must exist");
  const tone = source.slice(start,end);
  assert.ok(tone.includes('getVoiceAudioContext()'));
  assert.ok(tone.includes('ctx.createOscillator()'));
  assert.ok(tone.includes('ctx.createGain()'));
  assert.ok(tone.includes('ctx.resume()'));
  assert.ok(!tone.includes('fetch('), "local test must not contact TTS");
  assert.ok(source.includes('測試手機音效（不使用雲端）'));
  assert.ok(source.includes('deviceToneDiagnostic &&'));
});

test("MP3 diagnostics distinguish cloud generation, media load and actual player events", () => {
  const source = readPage();
  const preview = previewFunction();
  assert.ok(preview.includes('正在向 Google 語音服務產生'));
  assert.ok(preview.includes('雲端已回傳'));
  assert.ok(preview.includes('setVoicePreviewDiagnostic(err?.message'));
  assert.ok(source.includes('onLoadedMetadata={(event) => {'));
  assert.ok(source.includes('onPlaying={() => setVoicePreviewDiagnostic('));
  assert.ok(source.includes('onError={(event) => {'));
  assert.ok(source.includes('download={voicePreviewClip.label.includes("Iapetus")'));
  assert.ok(source.includes('另存 MP3 檢查音檔'));
  assert.ok(!preview.includes('setPersonalSettings('));
});

test("preview never mutates formal reminders, voice profile settings or timeline data", () => {
  const preview = previewFunction();
  for(const unsafe of ["setPersonalSettings(", "setVoiceSettingsDraft(", "setCurrentService(", "setNodes(", "announcedNodesRef", "voiceQueueRef", "setCheckedInService("]) {
    assert.ok(!preview.includes(unsafe), `preview should not mutate ${unsafe}`);
  }
});
