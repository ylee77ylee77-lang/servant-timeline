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
  assert.ok(source.includes("若沒有自動出聲，請按上方播放鍵"));
});

test("preview synthesis and playback failures are not silent or mistaken for success", () => {
  const preview = previewFunction();
  assert.ok(preview.includes('throw new Error(payload?.error || "試聽語音產生失敗")'));
  assert.ok(preview.includes("雲端語音沒有傳回有效音檔"));
  assert.ok(preview.includes("語音音檔已產生，但自動播放受限"));
  assert.ok(preview.includes('setCustomAlert({ isOpen: true, message: err?.message || "試聽語音失敗，請稍後再試。" })'));
});

test("preview never mutates formal reminders, voice profile settings or timeline data", () => {
  const preview = previewFunction();
  for(const unsafe of ["setPersonalSettings(", "setVoiceSettingsDraft(", "setCurrentService(", "setNodes(", "announcedNodesRef", "voiceQueueRef", "setCheckedInService("]) {
    assert.ok(!preview.includes(unsafe), `preview should not mutate ${unsafe}`);
  }
});
