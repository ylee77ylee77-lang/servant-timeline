const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let changed = false;

const replaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log("[chirp3-voices] " + label + " patched.");
  return source.split(from).join(to);
};

if (fs.existsSync(voiceApiPath)) {
  let api = fs.readFileSync(voiceApiPath, "utf8");

  api = replaceAll(api,
    `const VOICE_PROFILE_MAP: Record<string, { name: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number }> = {`,
    `const VOICE_PROFILE_MAP: Record<string, { name: string; languageCode: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number }> = {`,
    "voice profile type includes language"
  );

  api = replaceAll(api,
    `  young_female: {
    name: "cmn-TW-Wavenet-A",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 1.5,
    volumeGainDb: 0
  },
  mature_male: {
    name: "cmn-TW-Wavenet-B",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: -0.5,
    volumeGainDb: -0.5
  }`,
    `  young_female: {
    name: "cmn-CN-Chirp3-HD-Zephyr",
    languageCode: "cmn-CN",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0
  },
  mature_male: {
    name: "cmn-CN-Chirp3-HD-Iapetus",
    languageCode: "cmn-CN",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0
  },
  zephyr: {
    name: "cmn-CN-Chirp3-HD-Zephyr",
    languageCode: "cmn-CN",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0
  },
  iapetus: {
    name: "cmn-CN-Chirp3-HD-Iapetus",
    languageCode: "cmn-CN",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0
  }`,
    "replace Wavenet profiles with Chirp 3 HD"
  );

  api = replaceAll(api, `engine: "gemini-tts-primary"`, `engine: "google-cloud-text-to-speech"`, "GET engine google cloud");
  api = replaceAll(api, `voiceFamily: "gemini-2.5-flash-preview-tts"`, `voiceFamily: "cmn-CN-Chirp3-HD"`, "GET voice family Chirp 3 HD");
  api = replaceAll(api, `geminiVoices: ["Zephyr", "Iapetus"],`, `chirp3Voices: ["cmn-CN-Chirp3-HD-Zephyr", "cmn-CN-Chirp3-HD-Iapetus"],`, "GET Chirp voices");
  api = replaceAll(api, `hasGeminiTtsCredentials: Boolean(process.env.GEMINI_API_KEY),`, `hasGeminiTtsCredentials: Boolean(process.env.GEMINI_API_KEY),
    chirp3TestMode: true,`, "GET Chirp test mode");
  api = replaceAll(api, `voiceFamily: "cmn-TW-Wavenet"`, `voiceFamily: "cmn-CN-Chirp3-HD"`, "GET old family fallback");

  api = replaceAll(api,
    `const createSharedAudioCacheKey = (cleanedText: string, profile: { name: string; ssmlGender: "FEMALE" | "MALE" }, settings: { speakingRate: number; pitch: number; volumeGainDb: number; cacheVersion: string }) => {`,
    `const createSharedAudioCacheKey = (cleanedText: string, profile: { name: string; languageCode?: string; ssmlGender: "FEMALE" | "MALE" }, settings: { speakingRate: number; pitch: number; volumeGainDb: number; cacheVersion: string }) => {`,
    "cache key profile type includes language"
  );

  api = replaceAll(api, `    "google-cloud-tts",
    "cmn-TW-Wavenet",`, `    "google-cloud-tts",
    "cmn-CN-Chirp3-HD-test-v1",`, "cache key family Chirp 3 HD");
  api = replaceAll(api, `    profile.name,
    profile.ssMLGender,`, `    profile.name,
    profile.languageCode || "cmn-CN",
    profile.ssMLGender,`, "cache key language typo safe");
  api = replaceAll(api, `    profile.name,
    profile.ssmlGender,`, `    profile.name,
    profile.languageCode || "cmn-CN",
    profile.ssmlGender,`, "cache key language");

  api = replaceAll(api,
    `const voiceProfile = isPreview
      ? (normalizeInput(body.voiceProfile) || "young_female")
      : (globalSettings.voice_gender === "male" ? "mature_male" : "young_female");`,
    `const requestedVoiceProfile = normalizeInput(body.voiceProfile);
    const voiceProfile = isPreview
      ? (requestedVoiceProfile === "iapetus" || requestedVoiceProfile === "mature_male" ? "iapetus" : "zephyr")
      : (globalSettings.voice_gender === "male" ? "iapetus" : "zephyr");`,
    "voice profile maps to Chirp Zephyr/Iapetus"
  );

  api = replaceAll(api, `const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;`, `const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.zephyr;`, "base profile fallback Chirp");

  api = replaceAll(api,
    `        voice: {
          languageCode: "cmn-TW",
          name: baseProfile.name,
          ssmlGender: baseProfile.ssmlGender
        },`,
    `        voice: {
          languageCode: baseProfile.languageCode || "cmn-CN",
          name: baseProfile.name,
          ssmlGender: baseProfile.ssmlGender
        },`,
    "synthesize language uses Chirp language"
  );

  api = replaceAll(api, `"X-Voice-Family": "cmn-TW-Wavenet"`, `"X-Voice-Family": "cmn-CN-Chirp3-HD"`, "headers Chirp family");
  api = replaceAll(api, `"X-Voice-Engine": baseProfile.engine === "gemini" ? "gemini-tts" : "google-cloud-tts"`, `"X-Voice-Engine": "google-cloud-chirp3-hd"`, "headers Chirp engine dynamic");
  api = replaceAll(api, `"X-Voice-Engine": "google-cloud-tts"`, `"X-Voice-Engine": "google-cloud-chirp3-hd"`, "headers Chirp engine static");

  fs.writeFileSync(voiceApiPath, api, "utf8");
}

if (fs.existsSync(pagePath)) {
  let page = fs.readFileSync(pagePath, "utf8");
  page = replaceAll(page, "Gemini TTS：女聲 Zephyr、男聲 Iapetus", "Google Cloud Chirp 3 HD：Zephyr / Iapetus 測試", "page engine label");
  page = replaceAll(page, "語音助理由 Gemini TTS 的 Zephyr / Iapetus 產生；音調、語速與柔和度會轉成自然語音提示。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生，先測試自然度；目前可能較偏普通話口音。", "page engine description");
  page = replaceAll(page, "Gemini TTS 目前沒有成功產生音檔，已停止試聽，避免誤播瀏覽器舊聲音。請檢查 Vercel 的 GEMINI_API_KEY 或 Gemini TTS 額度。", "Google Cloud Chirp 3 HD 目前沒有成功產生音檔，已停止試聽。請檢查 Google Cloud TTS 權限或 Chirp 3 HD 聲音名稱。", "preview failure message");
  fs.writeFileSync(pagePath, page, "utf8");
}

console.log(changed ? "[chirp3-voices] Chirp 3 HD voice test applied." : "[chirp3-voices] no changes needed.");
