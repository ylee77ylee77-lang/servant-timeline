const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let page = fs.readFileSync(pagePath, "utf8");
let api = fs.readFileSync(voiceApiPath, "utf8");
let changedPage = false;
let changedApi = false;

const replaceAll = (source, from, to) => {
  if (!source.includes(from)) return { source, changed: false };
  return { source: source.split(from).join(to), changed: true };
};

const applyPage = (label, from, to) => {
  const result = replaceAll(page, from, to);
  page = result.source;
  changedPage = changedPage || result.changed;
  if (result.changed) console.log("[tts-usage-1m] page " + label + " patched.");
};

const applyApi = (label, from, to) => {
  const result = replaceAll(api, from, to);
  api = result.source;
  changedApi = changedApi || result.changed;
  if (result.changed) console.log("[tts-usage-1m] api " + label + " patched.");
};

applyPage(
  "DEFAULT_TTS_USAGE",
  `  primary: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  backup: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  total: { usedChars: 0, limitChars: 8000000, remainingChars: 8000000, usageRate: 0 }`,
  `  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }`
);

applyPage(
  "existing 4M primary literal",
  "limitChars: 4000000, remainingChars: 4000000",
  "limitChars: 1000000, remainingChars: 1000000"
);

applyPage(
  "existing 8M total literal",
  "limitChars: 8000000, remainingChars: 8000000",
  "limitChars: 2000000, remainingChars: 2000000"
);

applyApi("primary default", "const PRIMARY_DEFAULT_LIMIT = 4_000_000;", "const PRIMARY_DEFAULT_LIMIT = 1_000_000;");
applyApi("backup default", "const BACKUP_DEFAULT_LIMIT = 4_000_000;", "const BACKUP_DEFAULT_LIMIT = 1_000_000;");

applyApi(
  "primary env hard limit",
  "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);",
  "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;"
);

applyApi(
  "backup env hard limit",
  "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000);",
  "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;"
);

applyApi(
  "primary env hard limit after fallback patch",
  "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);",
  "const getPrimaryLimit = () => PRIMARY_DEFAULT_LIMIT;"
);

applyApi(
  "backup env hard limit after fallback patch",
  "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || BACKUP_DEFAULT_LIMIT);",
  "const getBackupLimit = () => BACKUP_DEFAULT_LIMIT;"
);

applyApi(
  "snapshot DB limits override",
  `  const primaryLimit = Number(primaryRow?.limit_chars || snapshot.primary.limitChars);
  const backupLimit = Number(backupRow?.limit_chars || snapshot.backup.limitChars);
  const totalUsed = primaryUsed + backupUsed;
  const totalLimit = primaryLimit + backupLimit;`,
  `  // 管理端指定固定額度：主帳號 1,000,000、備用帳號 1,000,000。
  // 即使資料庫舊紀錄或 Vercel 環境變數仍是 4,000,000，也以這裡為準。
  const primaryLimit = PRIMARY_DEFAULT_LIMIT;
  const backupLimit = hasProviderCredentials("backup") ? BACKUP_DEFAULT_LIMIT : 0;
  const totalUsed = primaryUsed + backupUsed;
  const totalLimit = primaryLimit + backupLimit;`
);

applyApi(
  "reserve function hard limits",
  `  const primaryLimit = getPrimaryLimit();
  const backupLimit = hasProviderCredentials("backup") ? getBackupLimit() : 0;`,
  `  const primaryLimit = PRIMARY_DEFAULT_LIMIT;
  const backupLimit = hasProviderCredentials("backup") ? BACKUP_DEFAULT_LIMIT : 0;`
);

applyApi(
  "legacy fallback hard limit",
  "const fallbackLimit = Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);",
  "const fallbackLimit = PRIMARY_DEFAULT_LIMIT;"
);

if (changedPage) fs.writeFileSync(pagePath, page, "utf8");
if (changedApi) fs.writeFileSync(voiceApiPath, api, "utf8");

console.log("[tts-usage-1m] page changed:", changedPage);
console.log("[tts-usage-1m] api changed:", changedApi);
