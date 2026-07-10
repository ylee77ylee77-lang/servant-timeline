const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");
const voiceSettingsApiPath = path.join(process.cwd(), "app", "api", "voice-settings", "route.ts");

let changed = false;

const replaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log("[final-chirp3-cleanup] " + label + " patched.");
  return source.split(from).join(to);
};

const replaceRegex = (source, pattern, to, label) => {
  if (!pattern.test(source)) return source;
  changed = true;
  console.log("[final-chirp3-cleanup] " + label + " patched.");
  return source.replace(pattern, to);
};

if (fs.existsSync(pagePath)) {
  let page = fs.readFileSync(pagePath, "utf8");

  page = replaceAll(page, "忘記密碼？設定新密碼新密碼", "忘記密碼？設定新密碼", "forgot password label");
  page = replaceAll(page, "設定新密碼新密碼", "設定新密碼", "reset password heading");

  page = replaceRegex(
    page,
    /<p className="text-sm font-bold text-\[#6D55A3\] mt-1">今日堂次：\{todayService\}<\/p>\s*<p className="text-\[11px\] font-bold text-\[#00B8B8\] mt-1">\s*今日堂次：\{todayService\} \{checkedInService \? "已鎖定" : "待確認"\}\s*<\/p>/,
    `<p className="text-sm font-bold text-[#6D55A3] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>`,
    "duplicate today service"
  );

  page = replaceAll(page, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v6";`, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v9";`, "voice cache name v6");
  page = replaceAll(page, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v7";`, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v9";`, "voice cache name v7");
  page = replaceAll(page, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v8";`, `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v9";`, "voice cache name v8");
  page = replaceAll(page, `const VOICE_AUDIO_CACHE_VERSION = "v6";`, `const VOICE_AUDIO_CACHE_VERSION = "v9-chirp3-hd";`, "voice cache version v6");
  page = replaceAll(page, `const VOICE_AUDIO_CACHE_VERSION = "v7";`, `const VOICE_AUDIO_CACHE_VERSION = "v9-chirp3-hd";`, "voice cache version v7");
  page = replaceAll(page, `const VOICE_AUDIO_CACHE_VERSION = "v8-gemini-style";`, `const VOICE_AUDIO_CACHE_VERSION = "v9-chirp3-hd";`, "voice cache version v8");

  page = replaceAll(page, "本月 Google TTS 用量", "本月語音字元用量", "usage title");
  page = replaceAll(page, "聲音調整", "管理預設語音", "admin voice section title");
  page = replaceAll(page, `<option value="female">女聲｜cmn-TW-Wavenet-A</option>`, `<option value="female">女聲 Zephyr</option>`, "female option label");
  page = replaceAll(page, `<option value="male">30歲男聲｜cmn-TW-Wavenet-B</option>`, `<option value="male">男聲 Iapetus</option>`, "male option label");
  page = replaceAll(page, "試聽目前草稿", "試聽 Zephyr / Iapetus", "preview button label");
  page = replaceAll(page, "套用全站聲音", "套用管理預設聲音", "apply button label");
  page = replaceAll(page, `套用後會更新快取版本，下一次正式提醒會使用新聲音。`, `套用後會更新快取版本；未另外選擇個人聲音的裝置，會使用管理預設聲音。`, "apply note");
  page = replaceAll(page, `{ key: "status", label: "狀態", icon: BarChart2, color: "purple" }`, `{ key: "status", label: "現場", icon: BarChart2, color: "purple" }`, "bottom nav status label");

  page = replaceAll(page, "Gemini TTS：女聲 Zephyr、男聲 Iapetus", "Google Cloud Chirp 3 HD：Zephyr / Iapetus 測試", "engine heading");
  page = replaceAll(page, "管理端預設語音已改為 Gemini TTS：女聲 Zephyr、男聲 Iapetus。已加入文字清理與後端共用快取；同工也可在個人設定自行選擇聲音。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生，先測試自然度；目前可能較偏普通話口音。Chirp 3 HD 不支援語速與音高參數，相關滑桿暫作備援紀錄。", "admin gemini description");
  page = replaceAll(page, "語音助理由 Gemini TTS 的 Zephyr / Iapetus 產生；音調、語速與柔和度會轉成自然語音提示。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生，先測試自然度；目前可能較偏普通話口音。Chirp 3 HD 不支援語速與音高參數，相關滑桿暫作備援紀錄。", "gemini description");
  page = replaceAll(page, "Gemini TTS 目前沒有成功產生音檔，已停止試聽，避免誤播瀏覽器舊聲音。請檢查 Vercel 的 GEMINI_API_KEY 或 Gemini TTS 額度。", "Google Cloud Chirp 3 HD 目前沒有成功產生音檔，已停止試聽，避免誤播瀏覽器舊聲音。請檢查 Google Cloud TTS 權限或 Chirp 3 HD 聲音名稱。", "preview error message");

  page = replaceAll(page, "語速 speakingRate", "語速 speakingRate（Chirp 3 HD 不套用）", "speaking rate label");
  page = replaceAll(page, "音高 pitch", "音高 pitch（Chirp 3 HD 不套用）", "pitch label");
  page = replaceAll(page, "語速提示 pace", "語速 speakingRate（Chirp 3 HD 不套用）", "pace label cleanup");
  page = replaceAll(page, "音調提示 tone", "音高 pitch（Chirp 3 HD 不套用）", "tone label cleanup");

  fs.writeFileSync(pagePath, page, "utf8");
}

for (const apiPath of [voiceApiPath, voiceSettingsApiPath]) {
  if (!fs.existsSync(apiPath)) continue;
  let api = fs.readFileSync(apiPath, "utf8");

  api = replaceAll(api, "const PRIMARY_DEFAULT_LIMIT = 4_000_000;", "const PRIMARY_DEFAULT_LIMIT = 1_000_000;", path.basename(path.dirname(apiPath)) + " primary limit");
  api = replaceAll(api, "const BACKUP_DEFAULT_LIMIT = 4_000_000;", "const BACKUP_DEFAULT_LIMIT = 1_000_000;", path.basename(path.dirname(apiPath)) + " backup limit");
  api = replaceAll(api, "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);", "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " primary hard limit");
  api = replaceAll(api, "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000);", "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " backup hard limit");
  api = replaceAll(api, "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);", "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " primary default hard limit");
  api = replaceAll(api, "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || BACKUP_DEFAULT_LIMIT);", "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " backup default hard limit");

  fs.writeFileSync(apiPath, api, "utf8");
}

console.log(changed ? "[final-chirp3-cleanup] cleanup applied." : "[final-chirp3-cleanup] no changes needed.");
