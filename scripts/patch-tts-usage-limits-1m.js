const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let page = fs.readFileSync(pagePath, "utf8");
let api = fs.readFileSync(voiceApiPath, "utf8");
let changedPage = false;
let changedApi = false;

const replaceAll = (targetName, source, from, to) => {
  if (!source.includes(from)) return { source, changed: false };
  return { source: source.split(from).join(to), changed: true };
};

let result = replaceAll(
  "page default usage",
  page,
  `  primary: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  backup: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  total: { usedChars: 0, limitChars: 8000000, remainingChars: 8000000, usageRate: 0 }`,
  `  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }`
);
page = result.source;
changedPage = changedPage || result.changed;
if (result.changed) console.log("[tts-usage-1m] page DEFAULT_TTS_USAGE patched.");

result = replaceAll(
  "api primary default",
  api,
  "const PRIMARY_DEFAULT_LIMIT = 4_000_000;",
  "const PRIMARY_DEFAULT_LIMIT = 1_000_000;"
);
api = result.source;
changedApi = changedApi || result.changed;
if (result.changed) console.log("[tts-usage-1m] api primary default patched.");

result = replaceAll(
  "api backup default",
  api,
  "const BACKUP_DEFAULT_LIMIT = 4_000_000;",
  "const BACKUP_DEFAULT_LIMIT = 1_000_000;"
);
api = result.source;
changedApi = changedApi || result.changed;
if (result.changed) console.log("[tts-usage-1m] api backup default patched.");

result = replaceAll(
  "api primary env fallback",
  api,
  "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);",
  "const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);"
);
api = result.source;
changedApi = changedApi || result.changed;
if (result.changed) console.log("[tts-usage-1m] api primary env fallback patched.");

result = replaceAll(
  "api backup env fallback",
  api,
  "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000);",
  "const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || BACKUP_DEFAULT_LIMIT);"
);
api = result.source;
changedApi = changedApi || result.changed;
if (result.changed) console.log("[tts-usage-1m] api backup env fallback patched.");

result = replaceAll(
  "api legacy fallback",
  api,
  "const fallbackLimit = Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);",
  "const fallbackLimit = Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);"
);
api = result.source;
changedApi = changedApi || result.changed;

if (changedPage) fs.writeFileSync(pagePath, page, "utf8");
if (changedApi) fs.writeFileSync(voiceApiPath, api, "utf8");

console.log("[tts-usage-1m] page changed:", changedPage);
console.log("[tts-usage-1m] api changed:", changedApi);
