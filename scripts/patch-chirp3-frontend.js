const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "page.tsx");
let s = fs.readFileSync(file, "utf8");
let changed = false;

const all = (a, b) => {
  if (!s.includes(a)) return;
  s = s.split(a).join(b);
  changed = true;
};

if (s.includes('.replace(/[，。！？、；：')) {
  s = s.replace(
    /const cleanTextForTtsBilling = \(value: any\) => \{[\s\S]*?\n\};/,
    `const cleanTextForTtsBilling = (value: any) => {
  return String(value || "")
    .replace(/[\\u200B-\\u200D\\uFEFF]/g, "")
    .replace(/\\r\\n?/g, "\\n")
    .replace(/[\\t ]+/g, " ")
    .replace(/\\n{3,}/g, "\\n\\n")
    .trim();
};`
  );
  changed = true;
}

all(
`  primary: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  backup: { usedChars: 0, limitChars: 4000000, remainingChars: 4000000 },
  total: { usedChars: 0, limitChars: 8000000, remainingChars: 8000000, usageRate: 0 }`,
`  primary: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  backup: { usedChars: 0, limitChars: 1000000, remainingChars: 1000000 },
  total: { usedChars: 0, limitChars: 2000000, remainingChars: 2000000, usageRate: 0 }`);

s = s.replace(
  /const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v\d+";\s*const VOICE_AUDIO_CACHE_VERSION = "[^"]+";/,
  `const VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v11";
  const VOICE_AUDIO_CACHE_VERSION = "v11-chirp3-html-audio";`
);

all(
`    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "young_female" as "young_female" | "mature_male"`,
`    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "zephyr" as "zephyr" | "iapetus"`);

all(
`          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile || "young_female"`,
`          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "iapetus" || parsed.voiceProfile === "mature_male" ? "iapetus" : "zephyr"`);

all(
`  const getVoiceProfile = () => globalVoiceSettings.voice_gender === "male" ? "mature_male" : "young_female";`,
`  const voiceProfileOptions = [
    { value: "zephyr", label: "女聲 Zephyr", description: "自然、明亮、溫柔，適合一般提醒。" },
    { value: "iapetus", label: "男聲 Iapetus", description: "自然、穩重、清楚，適合現場指令。" }
  ];
  const getVoiceProfile = () => personalSettings.voiceProfile === "iapetus" ? "iapetus" : "zephyr";`);

all(
`      globalVoiceSettings.cache_version || "v1",
      globalVoiceSettings.voice_gender || "female",`,
`      globalVoiceSettings.cache_version || "v1",
      getVoiceProfile(),`);

all(
`          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "mature_male" : "young_female",`,
`          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "iapetus" : "zephyr",`);

if (!s.includes('data-voice-profile-selector="chirp3"')) {
  const marker = /(<div>\s*<label className="block text-xs font-black text-\[#7B7B74\] mb-3 tracking-widest">提醒設定<\/label>)/;
  const ui = `<div data-voice-profile-selector="chirp3">
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">語音選擇</label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {voiceProfileOptions.map(option => (
                <button key={option.value} type="button"
                  onClick={() => updatePersonalSettings({ voiceProfile: option.value as "zephyr" | "iapetus" })}
                  className={"p-3 rounded-2xl border text-left transition-all " + (personalSettings.voiceProfile === option.value ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent" : "bg-white text-[#7B7B74] border-[#E6EAF0]")}>
                  <div className="text-sm font-black">{personalSettings.voiceProfile === option.value ? "✓ " : ""}{option.label}</div>
                  <div className="text-[10px] font-bold opacity-80 mt-1">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          $1`;
  if (!marker.test(s)) throw new Error("[chirp3-front] reminder marker missing");
  s = s.replace(marker, ui);
  changed = true;
}

if (!s.includes("const playVoiceBlob = async")) {
  const marker = `  const loadVoiceBuffer = async (text: string) => {`;
  const helper = `  const playVoiceBlob = async (blob: Blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    audio.preload = "auto";
    audio.volume = 1;

    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("瀏覽器無法播放語音音檔。"));
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(reject);
        }
      });
    } finally {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
    }
  };

${marker}`;
  if (!s.includes(marker)) throw new Error("[chirp3-front] loadVoiceBuffer marker missing");
  s = s.replace(marker, helper);
  changed = true;
}

all(
`          const buffer = await loadVoiceBuffer(nextText);
          await playVoiceBuffer(buffer);`,
`          const blob = await fetchVoiceBlob(nextText);
          if (!blob) throw new Error("語音音檔不存在。");
          await playVoiceBlob(blob);`);

all(
`      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      await playVoiceBuffer(decodedBuffer);`,
`      const blob = await response.blob();
      await playVoiceBlob(blob);`);

all("忘記密碼？設定新密碼新密碼", "忘記密碼？設定新密碼");
all("設定新密碼新密碼", "設定新密碼");
all("本月 Google TTS 用量", "本月語音字元用量");
all("聲音調整", "管理預設語音");
all(`<option value="female">女聲｜cmn-TW-Wavenet-A</option>`, `<option value="female">女聲 Zephyr</option>`);
all(`<option value="male">30歲男聲｜cmn-TW-Wavenet-B</option>`, `<option value="male">男聲 Iapetus</option>`);
all("試聽目前草稿", "試聽 Zephyr / Iapetus");
all("套用全站聲音", "套用管理預設聲音");
all("A方案：維持 Google Cloud Text-to-Speech 台灣華語 WaveNet。已加入文字清理與後端共用快取，只有徐東立可調整，所有同工共用。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生。系統保留標點與自然停頓，語速會實際套用。");
all("全站共用｜{globalVoiceSettings.voice_gender === \"male\" ? \"30歲男聲\" : \"台灣華語女聲\"}", "個人選擇｜{personalSettings.voiceProfile === \"iapetus\" ? \"男聲 Iapetus\" : \"女聲 Zephyr\"}");
all("聲音由管理員統一設定；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。", "每位同工可在本機選擇自己的語音；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。");
all(`{ key: "status", label: "狀態", icon: BarChart2, color: "purple" }`, `{ key: "status", label: "現場", icon: BarChart2, color: "purple" }`);

if (!s.includes("清除舊語音快取失敗")) {
  const v = `  const VOICE_AUDIO_CACHE_VERSION = "v11-chirp3-html-audio";`;
  s = s.replace(v, `${v}
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    void caches.keys().then(xs => Promise.all(xs.filter(x => x.startsWith("shekinah_voice_audio_") && x !== VOICE_AUDIO_CACHE_NAME).map(x => caches.delete(x)))).catch(err => console.warn("清除舊語音快取失敗:", err));
  }, []);`);
  changed = true;
}

if (s.includes('.replace(/[，。！？、；：')) throw new Error("[chirp3-front] punctuation still removed");
if (!s.includes('data-voice-profile-selector="chirp3"')) throw new Error("[chirp3-front] selector missing");
if (!s.includes('VOICE_AUDIO_CACHE_NAME = "shekinah_voice_audio_v11"')) throw new Error("[chirp3-front] cache v11 missing");
if (!s.includes("const playVoiceBlob = async")) throw new Error("[chirp3-front] HTML audio player missing");

fs.writeFileSync(file, s, "utf8");
console.log(changed ? "[chirp3-front] applied and verified" : "[chirp3-front] already stable");
