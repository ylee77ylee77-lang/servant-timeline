const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let changed = false;

const replaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log("[voice-diagnostics] " + label + " patched.");
  return source.split(from).join(to);
};

if (fs.existsSync(voiceApiPath)) {
  let api = fs.readFileSync(voiceApiPath, "utf8");

  api = replaceAll(api,
    `    engine: "google-cloud-text-to-speech",
    voiceFamily: "cmn-TW-Wavenet",`,
    `    engine: "gemini-tts-primary",
    voiceFamily: "gemini-2.5-flash-preview-tts",
    geminiVoices: ["Zephyr", "Iapetus"],
    hasGeminiTtsCredentials: Boolean(process.env.GEMINI_API_KEY),
    googleTtsFallbackAvailable: hasProviderCredentials("primary"),`,
    "GET engine diagnostics"
  );

  api = replaceAll(api,
    `    throw new Error(data?.error?.message || "Gemini TTS 產生語音失敗。");`,
    `    console.error("Gemini TTS failed", { status: response.status, detail: data?.error || data });
    throw new Error(data?.error?.message || "Gemini TTS 產生語音失敗。");`,
    "Gemini failure logging"
  );

  api = replaceAll(api,
    `        "X-Voice-Engine": "google-cloud-tts",`,
    `        "X-Voice-Engine": baseProfile.engine === "gemini" ? "gemini-tts" : "google-cloud-tts",`,
    "cache hit engine header"
  );

  api = replaceAll(api,
    `        "X-Voice-Engine": "google-cloud-tts",`,
    `        "X-Voice-Engine": baseProfile.engine === "gemini" ? "gemini-tts" : "google-cloud-tts",`,
    "final engine header"
  );

  fs.writeFileSync(voiceApiPath, api, "utf8");
}

if (fs.existsSync(pagePath)) {
  let page = fs.readFileSync(pagePath, "utf8");

  page = replaceAll(page,
    `        if (errorPayload?.fallbackToBrowser) {
          await speakWithBrowserVoiceFallback(sampleText);
          return;
        }`,
    `        if (errorPayload?.fallbackToBrowser) {
          setCustomAlert({ isOpen: true, message: "Gemini TTS 目前沒有成功產生音檔，已停止試聽，避免誤播瀏覽器舊聲音。請檢查 Vercel 的 GEMINI_API_KEY 或 Gemini TTS 額度。" });
          return;
        }`,
    "preview avoids silent browser fallback"
  );

  fs.writeFileSync(pagePath, page, "utf8");
}

console.log(changed ? "[voice-diagnostics] diagnostics applied." : "[voice-diagnostics] no changes needed.");
