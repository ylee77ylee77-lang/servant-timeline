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

// 修正管理頁舊語音文字，避免正式站仍混用 Google TTS / Wavenet 字樣。
page = replaceAll(page, "本月 Google TTS 用量", "本月語音字元用量", "usage title fallback");
page = replaceAll(page, "聲音調整", "管理預設語音", "voice section title fallback");
page = replaceAll(page, "A方案：維持 Google Cloud Text-to-Speech 台灣華語 WaveNet。", "語音助理由 Gemini TTS 產生，管理員可統一調整預設語音。", "voice description fallback");

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
  fs.writeFileSync(apiPath, api, "utf8");
}

console.log(changed ? "[ui-stability] cleanup applied." : "[ui-stability] no cleanup needed.");
