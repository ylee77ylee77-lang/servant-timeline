const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
let source = fs.readFileSync(pagePath, "utf8");
let changed = false;

const replaceAllSafe = (label, from, to) => {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
  console.log("[admin-zephyr-iapetus] " + label + " patched.");
};

replaceAllSafe(
  "admin voice description",
  "A方案：維持 Google Cloud Text-to-Speech 台灣華語 WaveNet。已加入文字清理與後端共用快取，只有徐東立可調整，所有同工共用。",
  "管理端預設語音已改為 Google Cloud Chirp 3 HD：女聲 Zephyr、男聲 Iapetus。已加入文字清理與後端共用快取；同工也可在個人設定自行選擇聲音。Chirp 3 HD 不支援語速與音高參數，相關滑桿暫作備援紀錄。"
);

replaceAllSafe(
  "old Gemini admin voice description",
  "管理端預設語音已改為 Gemini TTS：女聲 Zephyr、男聲 Iapetus。已加入文字清理與後端共用快取；同工也可在個人設定自行選擇聲音。",
  "管理端預設語音已改為 Google Cloud Chirp 3 HD：女聲 Zephyr、男聲 Iapetus。已加入文字清理與後端共用快取；同工也可在個人設定自行選擇聲音。Chirp 3 HD 不支援語速與音高參數，相關滑桿暫作備援紀錄。"
);

replaceAllSafe(
  "usage title",
  "本月 Google TTS 用量",
  "本月語音字元用量"
);

replaceAllSafe(
  "admin voice section title",
  "聲音調整",
  "管理預設語音"
);

replaceAllSafe(
  "female option label",
  "<option value=\"female\">女聲｜cmn-TW-Wavenet-A</option>",
  "<option value=\"female\">女聲 Zephyr</option>"
);

replaceAllSafe(
  "male option label",
  "<option value=\"male\">30歲男聲｜cmn-TW-Wavenet-B</option>",
  "<option value=\"male\">男聲 Iapetus</option>"
);

replaceAllSafe(
  "speaking rate label",
  "語速 speakingRate",
  "語速 speakingRate（Chirp 3 HD 不套用）"
);

replaceAllSafe(
  "legacy speaking rate label",
  "語速 speakingRate（備援 / 快取參數）",
  "語速 speakingRate（Chirp 3 HD 不套用）"
);

replaceAllSafe(
  "pitch label",
  "音高 pitch",
  "音高 pitch（Chirp 3 HD 不套用）"
);

replaceAllSafe(
  "legacy pitch label",
  "音高 pitch（備援 / 快取參數）",
  "音高 pitch（Chirp 3 HD 不套用）"
);

replaceAllSafe(
  "volume label",
  "柔和度 volumeGainDb",
  "柔和度 volumeGainDb"
);

replaceAllSafe(
  "preview button label",
  "試聽目前草稿",
  "試聽 Zephyr / Iapetus"
);

replaceAllSafe(
  "apply button label",
  "套用全站聲音",
  "套用管理預設聲音"
);

replaceAllSafe(
  "apply note",
  "套用後會更新快取版本，下一次正式提醒會使用新聲音。",
  "套用後會更新快取版本；未另外選擇個人聲音的裝置，會使用管理預設聲音。"
);

replaceAllSafe(
  "personal card heading old global male",
  "全站共用｜{globalVoiceSettings.voice_gender === \"male\" ? \"男聲 Iapetus\" : \"女聲 Zephyr\"}",
  "個人選擇｜{personalSettings.voiceProfile === \"iapetus\" ? \"男聲 Iapetus\" : \"女聲 Zephyr\"}"
);

replaceAllSafe(
  "personal card heading old global raw",
  "全站共用｜{globalVoiceSettings.voice_gender === \"male\" ? \"30歲男聲\" : \"台灣華語女聲\"}",
  "個人選擇｜{personalSettings.voiceProfile === \"iapetus\" ? \"男聲 Iapetus\" : \"女聲 Zephyr\"}"
);

if (changed) {
  fs.writeFileSync(pagePath, source, "utf8");
  console.log("[admin-zephyr-iapetus] app/page.tsx patched for this build.");
} else {
  console.log("[admin-zephyr-iapetus] no changes needed.");
}
