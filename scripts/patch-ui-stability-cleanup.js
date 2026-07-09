const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");
const voiceSettingsApiPath = path.join(process.cwd(), "app", "api", "voice-settings", "route.ts");

let changed = false;

const replaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log("[ui-stability] " + label + " patched.");
  return source.split(from).join(to);
};

let page = fs.readFileSync(pagePath, "utf8");

// 保持語音額度原始碼也接近正式站設定，降低日後 patch 失效時回到 8M 的風險。
page = replaceAll(page,
  `  primary: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  backup: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  total: { usedChars: 0, limitChars: 8000000, remainingChars: 8000000, usageRate: 0 }`,
  `  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }`,
  "page tts defaults"
);
page = replaceAll(page, "limitChars: 4000000, remainingChars: 4000000", "limitChars: 1000000, remainingChars: 1000000", "remaining 4m literals");
page = replaceAll(page, "limitChars: 8000000, remainingChars: 8000000", "limitChars: 2000000, remainingChars: 2000000", "remaining 8m literals");

// 修正報到頁重複文字。
page = replaceAll(page,
  `                  <p className="text-sm font-bold text-[#6D55A3] mt-1">今日堂次：{todayService}</p>
                  <p className="text-[11px] font-bold text-[#00B8B8] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>`,
  `                  <p className="text-sm font-bold text-[#6D55A3] mt-1">
                    今日堂次：{todayService} {checkedInService ? "已鎖定" : "待確認"}
                  </p>`,
  "duplicate today service text"
);
page = replaceAll(page, "忘記密碼？設定新密碼新密碼", "忘記密碼？設定新密碼", "forgot password duplicate label");
page = replaceAll(page, "設定新密碼新密碼", "設定新密碼", "reset password duplicate heading");

// 語音穩定化：Zephyr / Iapetus 是 Gemini 角色聲線，不適合拿來當可調音高的穩定男/女聲主控。
// 將正式提醒與管理試聽改回 Google Cloud TTS 固定男女聲，音高、語速、音量才會作用在同一個人聲上。
page = replaceAll(page,
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "zephyr" as "zephyr" | "iapetus"`,
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "young_female" as "young_female" | "mature_male"`,
  "stable personal voice profile type"
);
page = replaceAll(page,
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "mature_male" || parsed.voiceProfile === "iapetus" ? "iapetus" : "zephyr"`,
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "mature_male" || parsed.voiceProfile === "iapetus" ? "mature_male" : "young_female"`,
  "migrate legacy personal voice profile"
);
page = replaceAll(page,
  `  const voiceProfileOptions = [
    { value: "zephyr", label: "女聲 Zephyr", description: "明亮、溫柔，適合一般提醒。" },
    { value: "iapetus", label: "男聲 Iapetus", description: "穩重、清楚，適合現場指令。" }
  ];

  const getVoiceProfile = () => personalSettings.voiceProfile || "zephyr";`,
  `  const voiceProfileOptions = [
    { value: "young_female", label: "女聲｜固定台灣華語", description: "溫柔清楚，音高調整會維持同一人聲。" },
    { value: "mature_male", label: "男聲｜固定台灣華語", description: "穩重清楚，避免男聲跳成女聲。" }
  ];

  const getVoiceProfile = () => personalSettings.voiceProfile === "mature_male" || personalSettings.voiceProfile === "iapetus" ? "mature_male" : "young_female";`,
  "stable voice selector"
);
page = replaceAll(page,
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "iapetus" : "zephyr",`,
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "mature_male" : "young_female",`,
  "stable admin preview profile"
);
page = replaceAll(page, "個人選擇｜{personalSettings.voiceProfile === \"iapetus\" ? \"男聲 Iapetus\" : \"女聲 Zephyr\"}", "個人選擇｜{getVoiceProfile() === \"mature_male\" ? \"男聲｜固定台灣華語\" : \"女聲｜固定台灣華語\"}", "personal heading stable labels");
page = replaceAll(page, "女聲 Zephyr", "女聲｜固定台灣華語", "stable female labels");
page = replaceAll(page, "男聲 Iapetus", "男聲｜固定台灣華語", "stable male labels");
page = replaceAll(page, "Gemini TTS：女聲｜固定台灣華語、男聲｜固定台灣華語", "Google Cloud TTS：女聲固定台灣華語、男聲固定台灣華語", "stable engine description");
page = replaceAll(page, "語音助理由 Gemini TTS 產生，管理員可統一調整預設語音。", "語音助理由 Google Cloud TTS 固定男女聲產生，管理員可調整語速、音高與音量。", "stable voice description fallback");
page = replaceAll(page, "試聽 Zephyr / Iapetus", "試聽固定男女聲", "stable preview label");
page = replaceAll(page, "語速 speakingRate（備援 / 快取參數）", "語速 speakingRate", "speaking rate active label");
page = replaceAll(page, "音高 pitch（備援 / 快取參數）", "音高 pitch", "pitch active label");
page = replaceAll(page, "柔和度 volumeGainDb（備援 / 快取參數）", "音量 volumeGainDb", "volume active label");

// 修正管理頁舊語音文字，避免正式站仍混用舊描述。
page = replaceAll(page, "本月 Google TTS 用量", "本月語音字元用量", "usage title fallback");
page = replaceAll(page, "聲音調整", "管理預設語音", "voice section title fallback");
page = replaceAll(page, "A方案：維持 Google Cloud Text-to-Speech 台灣華語 WaveNet。", "語音助理由 Google Cloud TTS 固定男女聲產生，管理員可調整語速、音高與音量。", "voice description fallback");

fs.writeFileSync(pagePath, page, "utf8");

for (const apiPath of [voiceApiPath, voiceSettingsApiPath]) {
  if (!fs.existsSync(apiPath)) continue;
  let api = fs.readFileSync(apiPath, "utf8");
  api = replaceAll(api, "const PRIMARY_DEFAULT_LIMIT = 4_000_000;", "const PRIMARY_DEFAULT_LIMIT = 1_000_000;", path.basename(path.dirname(apiPath)) + " primary limit");
  api = replaceAll(api, "const BACKUP_DEFAULT_LIMIT = 4_000_000;", "const BACKUP_DEFAULT_LIMIT = 1_000_000;", path.basename(path.dirname(apiPath)) + " backup limit");
  api = replaceAll(api, "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);", "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " primary hard limit");
  api = replaceAll(api, "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000);", "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " backup hard limit");
  api = replaceAll(api, "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);", "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " primary default hard limit");
  api = replaceAll(api, "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || BACKUP_DEFAULT_LIMIT);", "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;", path.basename(path.dirname(apiPath)) + " backup default hard limit");

  if (apiPath === voiceApiPath) {
    api = replaceAll(api,
      `    const requestedVoiceProfile = normalizeInput(body.voiceProfile);
    const voiceProfile = requestedVoiceProfile === "iapetus" || requestedVoiceProfile === "mature_male"
      ? "iapetus"
      : "zephyr";

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.zephyr;`,
      `    const requestedVoiceProfile = normalizeInput(body.voiceProfile);
    const voiceProfile = requestedVoiceProfile === "iapetus" || requestedVoiceProfile === "mature_male"
      ? "mature_male"
      : "young_female";

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;`,
      "voice api stable profile selection"
    );
    api = replaceAll(api, "engine: \"gemini\",\n    geminiVoiceName: \"Zephyr\"", "engine: \"google\",\n    geminiVoiceName: \"Zephyr\"", "disable zephyr gemini engine");
    api = replaceAll(api, "engine: \"gemini\",\n    geminiVoiceName: \"Iapetus\"", "engine: \"google\",\n    geminiVoiceName: \"Iapetus\"", "disable iapetus gemini engine");
  }

  fs.writeFileSync(apiPath, api, "utf8");
}

console.log(changed ? "[ui-stability] cleanup applied." : "[ui-stability] no cleanup needed.");
