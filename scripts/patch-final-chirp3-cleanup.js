const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");
const voiceSettingsApiPath = path.join(process.cwd(), "app", "api", "voice-settings", "route.ts");
const legacyVoiceSettingsApiPath = path.join(process.cwd(), "app", "api", "voice", "voice-settings", "route.ts");

let changed = false;

const optionalReplaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log(`[final-chirp3-cleanup] ${label} patched.`);
  return source.split(from).join(to);
};

const requiredReplaceAll = (source, from, to, label) => {
  if (source.includes(to)) {
    console.log(`[final-chirp3-cleanup] ${label} already patched.`);
    return source;
  }

  if (!source.includes(from)) {
    throw new Error(`[final-chirp3-cleanup] Required target missing: ${label}`);
  }

  changed = true;
  console.log(`[final-chirp3-cleanup] ${label} patched.`);
  return source.split(from).join(to);
};

const assertContains = (source, expected, label) => {
  if (!source.includes(expected)) {
    throw new Error(`[final-chirp3-cleanup] Verification failed: ${label}`);
  }
};

const assertNotContains = (source, unexpected, label) => {
  if (source.includes(unexpected)) {
    throw new Error(`[final-chirp3-cleanup] Forbidden content found: ${label}`);
  }
};

if (!fs.existsSync(pagePath)) {
  throw new Error("[final-chirp3-cleanup] app/page.tsx not found.");
}

let page = fs.readFileSync(pagePath, "utf8");

page = requiredReplaceAll(
  page,
  `const cleanTextForTtsBilling = (value: any) => {
  return String(value || "")
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, "")
    .replace(/[\\r\\n\\t]+/g, "")
    .replace(/[\\s　]+/g, "")
    .replace(/[，。！？、；：,.!?;:"“”'‘’「」『』（）()【】\\[\\]《》〈〉…—–_~～·・•]/g, "")
    .replace(/[✅☑️✔️❌⭕⭐🌟✨🔥💡📌📍👉👈🙏🙌🎉🔔]/g, "")
    .trim();
};`,
  `const cleanTextForTtsBilling = (value: any) => {
  return String(value || "")
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, "")
    .replace(/\\r\\n?/g, "\\n")
    .replace(/[\\t ]+/g, " ")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
};`,
  "preserve punctuation and natural pauses"
);

page = requiredReplaceAll(
  page,
  `  primary: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  backup: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  total: { usedChars: 0, limitChars: 8000000, remainingChars: 8000000, usageRate: 0 }`,
  `  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }`,
  "voice usage defaults"
);

page = requiredReplaceAll(
  page,
  `  const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v6";
  const VOICE_AUDIO_CACHE_VERSION = "v6";`,
  `  const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v10";
  const VOICE_AUDIO_CACHE_VERSION = "v10-chirp3-punctuation";`,
  "voice browser cache version"
);

page = requiredReplaceAll(
  page,
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "young_female" as "young_female" | "mature_male"`,
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "zephyr" as "zephyr" | "iapetus"`,
  "personal voice profile type"
);

page = requiredReplaceAll(
  page,
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile || "young_female"`,
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "iapetus" || parsed.voiceProfile === "mature_male" ? "iapetus" : "zephyr"`,
  "personal voice profile migration"
);

page = requiredReplaceAll(
  page,
  `  const getVoiceProfile = () => globalVoiceSettings.voice_gender === "male" ? "mature_male" : "young_female";`,
  `  const voiceProfileOptions = [
    { value: "zephyr", label: "女聲 Zephyr", description: "自然、明亮、溫柔，適合一般提醒。" },
    { value: "iapetus", label: "男聲 Iapetus", description: "自然、穩重、清楚，適合現場指令。" }
  ];

  const getVoiceProfile = () => personalSettings.voiceProfile === "iapetus" ? "iapetus" : "zephyr";`,
  "personal Chirp voice selector"
);

page = requiredReplaceAll(
  page,
  `      globalVoiceSettings.cache_version || "v1",
      globalVoiceSettings.voice_gender || "female",`,
  `      globalVoiceSettings.cache_version || "v1",
      getVoiceProfile(),`,
  "cache fingerprint personal voice"
);

page = requiredReplaceAll(
  page,
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "mature_male" : "young_female",`,
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "iapetus" : "zephyr",`,
  "preview Chirp profile"
);

page = optionalReplaceAll(page, "忘記密碼？設定新密碼新密碼", "忘記密碼？設定新密碼", "forgot password label");
page = optionalReplaceAll(page, "設定新密碼新密碼", "設定新密碼", "reset password heading");
page = optionalReplaceAll(page, "本月 Google TTS 用量", "本月語音字元用量", "usage title");
page = optionalReplaceAll(page, "聲音調整", "管理預設語音", "admin voice section title");
page = optionalReplaceAll(page, `<option value="female">女聲｜cmn-TW-Wavenet-A</option>`, `<option value="female">女聲 Zephyr</option>`, "female option label");
page = optionalReplaceAll(page, `<option value="male">30歲男聲｜cmn-TW-Wavenet-B</option>`, `<option value="male">男聲 Iapetus</option>`, "male option label");
page = optionalReplaceAll(page, "試聽目前草稿", "試聽 Zephyr / Iapetus", "preview button label");
page = optionalReplaceAll(page, "套用全站聲音", "套用管理預設聲音", "apply button label");
page = optionalReplaceAll(page, "套用後會更新快取版本，下一次正式提醒會使用新聲音。", "套用後會更新快取版本；未另外選擇個人聲音的裝置，會使用管理預設聲音。", "apply note");
page = optionalReplaceAll(page, `{ key: "status", label: "狀態", icon: BarChart2, color: "purple" }`, `{ key: "status", label: "現場", icon: BarChart2, color: "purple" }`, "bottom nav status label");
page = optionalReplaceAll(page, "A方案：維持 Google Cloud Text-to-Speech 台灣華語 WaveNet。已加入文字清理與後端共用快取，只有徐東立可調整，所有同工共用。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生。系統保留標點與自然停頓，語速會實際套用；目前聲音可能較偏普通話口音。", "legacy Wavenet description");
page = optionalReplaceAll(page, "Gemini TTS：女聲 Zephyr、男聲 Iapetus", "Google Cloud Chirp 3 HD：Zephyr / Iapetus", "engine heading");
page = optionalReplaceAll(page, "語音助理由 Gemini TTS 的 Zephyr / Iapetus 產生；音調、語速與柔和度會轉成自然語音提示。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生。系統保留標點與自然停頓，語速會實際套用；音高與音量目前僅保留設定值，不直接套用。", "Gemini description cleanup");
page = optionalReplaceAll(page, "語速提示 pace", "語速 speakingRate", "speaking rate label");
page = optionalReplaceAll(page, "音調提示 tone", "音高 pitch（目前不直接套用）", "pitch label");
page = optionalReplaceAll(page, "柔和度提示 warmth", "音量 volumeGainDb（目前不直接套用）", "volume label");
page = optionalReplaceAll(page, "音高 pitch", "音高 pitch（目前不直接套用）", "pitch label legacy");
page = optionalReplaceAll(page, "柔和度 volumeGainDb", "音量 volumeGainDb（目前不直接套用）", "volume label legacy");

const reminderLabel = `          <div>
             <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒設定</label>`;
const voiceSelector = `          <div>
             <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">語音選擇</label>
             <div className="grid grid-cols-2 gap-2 mb-6">
               {voiceProfileOptions.map(option => (
                 <button
                   key={option.value}
                   type="button"
                   onClick={() => updatePersonalSettings({ voiceProfile: option.value as "zephyr" | "iapetus" })}
                   className={"p-3 rounded-2xl border text-left transition-all " + (personalSettings.voiceProfile === option.value ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent shadow-md shadow-[#F25D6B]/15" : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
                 >
                   <div className="text-sm font-black">{personalSettings.voiceProfile === option.value ? "✓ " : ""}{option.label}</div>
                   <div className="text-[10px] font-bold opacity-80 mt-1 leading-relaxed">{option.description}</div>
                 </button>
               ))}
             </div>
           </div>

${reminderLabel}`;

if (!page.includes("語音選擇</label>")) {
  page = requiredReplaceAll(page, reminderLabel, voiceSelector, "insert personal voice selector UI");
}

const cacheVersionLine = `  const VOICE_AUDIO_CACHE_VERSION = "v10-chirp3-punctuation";`;
const cacheCleanupEffect = `${cacheVersionLine}

  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;

    void caches.keys().then(names => Promise.all(
      names
        .filter(name => name.startsWith("shekinah_voice_audio_") && name !== VOICE_AUDIO_CACHE_NAME)
        .map(name => caches.delete(name))
    )).catch(err => console.warn("清除舊語音快取失敗:", err));
  }, []);`;

if (!page.includes("清除舊語音快取失敗")) {
  page = requiredReplaceAll(page, cacheVersionLine, cacheCleanupEffect, "cleanup old browser voice caches");
}

fs.writeFileSync(pagePath, page, "utf8");

const voiceApi = fs.readFileSync(voiceApiPath, "utf8");
const voiceSettingsApi = fs.readFileSync(voiceSettingsApiPath, "utf8");
const legacyVoiceSettingsApi = fs.readFileSync(legacyVoiceSettingsApiPath, "utf8");

assertContains(page, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v10";`, "browser cache v10");
assertContains(page, `voiceProfile: "zephyr" as "zephyr" | "iapetus"`, "personal voice profile type");
assertContains(page, `.replace(/\\r\\n?/g, "\\n")`, "punctuation-preserving text normalization");
assertNotContains(page, `.replace(/[，。！？、；：`, "frontend punctuation deletion removed");

assertContains(voiceApi, `name: "cmn-CN-Chirp3-HD-Zephyr"`, "Zephyr voice configured");
assertContains(voiceApi, `name: "cmn-CN-Chirp3-HD-Iapetus"`, "Iapetus voice configured");
assertContains(voiceApi, `input: { text: speechText }`, "speech text sent with punctuation");
assertContains(voiceApi, `speakingRate`, "speaking rate applied");
assertContains(voiceApi, `GOOGLE_TTS_TIMEOUT_MS`, "Google request timeout");
assertContains(voiceApi, `X-Voice-Punctuation`, "punctuation diagnostic header");
assertNotContains(voiceApi, "generateGeminiTtsAudio", "Gemini TTS helper removed");
assertNotContains(voiceApi, "gemini-2.5-flash-preview-tts", "Gemini TTS model removed");
assertNotContains(voiceApi, "generativelanguage.googleapis.com", "Gemini endpoint removed from voice API");
assertNotContains(voiceApi, "cmn-TW-Wavenet", "Wavenet removed from voice API");

assertContains(voiceSettingsApi, `voiceFamily: "cmn-CN-Chirp3-HD"`, "unified Chirp settings diagnostics");
assertContains(legacyVoiceSettingsApi, `from "../../voice-settings/route"`, "legacy settings route forwards to unified route");

console.log(changed ? "[final-chirp3-cleanup] frontend cleanup applied and verified." : "[final-chirp3-cleanup] already stable and verified.");
