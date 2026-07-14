const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let page = fs.readFileSync(pagePath, "utf8");
let voiceApi = fs.readFileSync(voiceApiPath, "utf8");
let changedPage = false;
let changedApi = false;

const replacePage = (label, from, to) => {
  if (page.includes(to)) {
    console.log("[zephyr-iapetus] page " + label + " already patched.");
    return;
  }
  if (!page.includes(from)) {
    console.warn("[zephyr-iapetus] page " + label + " target not found; skipped.");
    return;
  }
  page = page.replace(from, to);
  changedPage = true;
  console.log("[zephyr-iapetus] page " + label + " patched.");
};

const replaceApi = (label, from, to) => {
  if (voiceApi.includes(to)) {
    console.log("[zephyr-iapetus] api " + label + " already patched.");
    return;
  }
  if (!voiceApi.includes(from)) {
    console.warn("[zephyr-iapetus] api " + label + " target not found; skipped.");
    return;
  }
  voiceApi = voiceApi.replace(from, to);
  changedApi = true;
  console.log("[zephyr-iapetus] api " + label + " patched.");
};

const replaceAllPage = (label, from, to) => {
  if (!page.includes(from)) return;
  page = page.split(from).join(to);
  changedPage = true;
  console.log("[zephyr-iapetus] page " + label + " patched.");
};

// Frontend: use personal profile instead of global gender.
replacePage(
  "personal voice profile type",
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "young_female" as "young_female" | "mature_male"`,
  `    voiceDetailLevel: "standard" as "simple" | "standard" | "detailed",
    voiceProfile: "zephyr" as "zephyr" | "iapetus"`
);

replacePage(
  "saved profile fallback",
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile || "young_female"`,
  `          voiceDetailLevel: parsed.voiceDetailLevel || "standard",
          voiceProfile: parsed.voiceProfile === "mature_male" || parsed.voiceProfile === "iapetus" ? "iapetus" : "zephyr"`
);

replacePage(
  "voice profile getter",
  `  const getVoiceProfile = () => globalVoiceSettings.voice_gender === "male" ? "mature_male" : "young_female";`,
  `  const voiceProfileOptions = [
    { value: "zephyr", label: "女聲 Zephyr", description: "明亮、溫柔，適合一般提醒。" },
    { value: "iapetus", label: "男聲 Iapetus", description: "穩重、清楚，適合現場指令。" }
  ];

  const getVoiceProfile = () => personalSettings.voiceProfile || "zephyr";`
);

replacePage(
  "cache fingerprint personal voice",
  `      globalVoiceSettings.cache_version || "v1",
      globalVoiceSettings.voice_gender || "female",
      toFixedVoiceNumber(globalVoiceSettings.speaking_rate, 0.92),
      toFixedVoiceNumber(globalVoiceSettings.pitch, 1.5),
      toFixedVoiceNumber(globalVoiceSettings.volume_gain_db, 0)`,
  `      globalVoiceSettings.cache_version || "v1",
      personalSettings.voiceProfile || "zephyr",
      toFixedVoiceNumber(globalVoiceSettings.speaking_rate, 0.92),
      toFixedVoiceNumber(globalVoiceSettings.pitch, 1.5),
      toFixedVoiceNumber(globalVoiceSettings.volume_gain_db, 0)`
);

replacePage(
  "admin preview profile",
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "mature_male" : "young_female",`,
  `          voiceProfile: voiceSettingsDraft.voice_gender === "male" ? "iapetus" : "zephyr",`
);

replacePage(
  "settings voice card heading",
  `                全站共用｜{globalVoiceSettings.voice_gender === "male" ? "30歲男聲" : "台灣華語女聲"}`, 
  `                個人選擇｜{personalSettings.voiceProfile === "iapetus" ? "男聲 Iapetus" : "女聲 Zephyr"}`
);

replacePage(
  "settings voice card description",
  `              聲音由管理員統一設定；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。`,
  `              每位同工可在本機選擇自己的語音；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。`
);

replacePage(
  "voice option selector insert",
  `          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒設定</label>`,
  `          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">語音選擇</label>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {voiceProfileOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => updatePersonalSettings({ voiceProfile: option.value as any })}
                  className={"p-3 rounded-2xl border text-left transition-all " + (personalSettings.voiceProfile === option.value ? "bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white border-transparent shadow-md shadow-[#F25D6B]/15" : "bg-white text-[#7B7B74] border-[#E6EAF0]")}
                >
                  <div className="text-sm font-black">{personalSettings.voiceProfile === option.value ? "✓ " : ""}{option.label}</div>
                  <div className="text-[10px] font-bold opacity-80 mt-1 leading-relaxed">{option.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-[#7B7B74] mb-3 tracking-widest">提醒設定</label>`
);

replaceAllPage("legacy female label", "台灣華語女聲", "女聲 Zephyr");
replaceAllPage("legacy male label", "30歲男聲", "男聲 Iapetus");

// API: add Gemini TTS profile support for Zephyr and Iapetus.
replaceApi(
  "voice profile map",
  `const VOICE_PROFILE_MAP: Record<string, { name: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number }> = {
  young_female: {
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
  }
};`,
  `const VOICE_PROFILE_MAP: Record<string, { name: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number; engine?: "google" | "gemini"; geminiVoiceName?: string }> = {
  zephyr: {
    name: "Zephyr",
    ssmlGender: "FEMALE",
    speakingRate: 1,
    pitch: 0,
    volumeGainDb: 0,
    engine: "gemini",
    geminiVoiceName: "Zephyr"
  },
  iapetus: {
    name: "Iapetus",
    ssmlGender: "MALE",
    speakingRate: 1,
    pitch: 0,
    volumeGainDb: 0,
    engine: "gemini",
    geminiVoiceName: "Iapetus"
  },
  young_female: {
    name: "cmn-TW-Wavenet-A",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 1.5,
    volumeGainDb: 0,
    engine: "google"
  },
  mature_male: {
    name: "cmn-TW-Wavenet-B",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: -0.5,
    volumeGainDb: -0.5,
    engine: "google"
  }
};`
);

replaceApi(
  "default settings",
  `  voice_gender: "female",
  speaking_rate: 0.92,
  pitch: 1.5,`,
  `  voice_gender: "female",
  voice_profile: "zephyr",
  speaking_rate: 1,
  pitch: 0,`
);

replaceApi(
  "global settings return",
  `    voice_gender: row.voice_gender === "male" ? "male" : "female",
    speaking_rate: clampNumber(row.speaking_rate, DEFAULT_GLOBAL_VOICE_SETTINGS.speaking_rate, 0.8, 1.1),`,
  `    voice_gender: row.voice_gender === "male" ? "male" : "female",
    voice_profile: row.voice_profile === "iapetus" ? "iapetus" : "zephyr",
    speaking_rate: clampNumber(row.speaking_rate, DEFAULT_GLOBAL_VOICE_SETTINGS.speaking_rate, 0.8, 1.1),`
);

replaceApi(
  "cache key family",
  `    "google-cloud-tts",
    "cmn-TW-Wavenet",`,
  `    profile.name === "Zephyr" || profile.name === "Iapetus" ? "gemini-tts" : "google-cloud-tts",
    profile.name === "Zephyr" || profile.name === "Iapetus" ? "gemini-2.5-flash-preview-tts" : "cmn-TW-Wavenet",`
);

replaceApi(
  "add wav and gemini helpers",
  `const getServiceCloseMinutes = (serviceType: string) => {`,
  `const createWavFromPcmBase64 = (pcmBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) => {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
};

const generateGeminiTtsAudio = async (text: string, voiceName: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 GEMINI_API_KEY，無法使用 Gemini TTS 語音。");
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=" + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    })
  });

  const data = await response.json().catch(() => null);
  const inlineData = data?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData)?.inlineData;
  const audioData = inlineData?.data;

  if (!response.ok || !audioData) {
    throw new Error(data?.error?.message || "Gemini TTS 產生語音失敗。");
  }

  return createWavFromPcmBase64(audioData);
};

const getServiceCloseMinutes = (serviceType: string) => {`
);

replaceApi(
  "voice profile selection",
  `    const voiceProfile = isPreview
      ? (normalizeInput(body.voiceProfile) || "young_female")
      : (globalSettings.voice_gender === "male" ? "mature_male" : "young_female");

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;`,
  `    const requestedVoiceProfile = normalizeInput(body.voiceProfile);
    const voiceProfile = requestedVoiceProfile === "iapetus" || requestedVoiceProfile === "mature_male"
      ? "iapetus"
      : "zephyr";

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.zephyr;`
);

replaceApi(
  "cache hit content type",
  `            "Content-Type": "audio/mpeg",`,
  `            "Content-Type": baseProfile.engine === "gemini" ? "audio/wav" : "audio/mpeg",`
);

replaceApi(
  "cache hit family",
  `            "X-Voice-Family": "cmn-TW-Wavenet",`,
  `            "X-Voice-Family": baseProfile.engine === "gemini" ? "gemini-2.5-flash-preview-tts" : "cmn-TW-Wavenet",`
);

replaceApi(
  "tts synth section",
  `    const providerKey = reservation.providerKey || "primary";
    const accessToken = await getGoogleAccessToken(providerKey);

    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        "Authorization": \`Bearer \${accessToken}\`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: {
          text
        },
        voice: {
          languageCode: "cmn-TW",
          name: baseProfile.name,
          ssmlGender: baseProfile.ssmlGender
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate,
          pitch,
          volumeGainDb
        }
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.audioContent) {
      return NextResponse.json(
        {
          error: data?.error?.message || "Google Cloud TTS 產生語音失敗，已退回瀏覽器語音。",
          fallbackToBrowser: true,
          status: response.status,
          detail: data
        },
        { status: response.status || 502 }
      );
    }

    if (!isPreview) {
      await saveCachedAudioBase64({
        cacheKey,
        textHash,
        cleanedText: text,
        voiceName: baseProfile.name,
        voiceGender: baseProfile.ssmlGender,
        speakingRate,
        pitch,
        volumeGainDb,
        cacheVersion,
        providerKey,
        charCount,
        audioBase64: data.audioContent
      });
    }

    const audioBuffer = Buffer.from(data.audioContent, "base64");`,
  `    const providerKey = reservation.providerKey || "primary";
    let audioBuffer: Buffer;
    let audioBase64ForCache = "";

    if (baseProfile.engine === "gemini") {
      audioBuffer = await generateGeminiTtsAudio(text, baseProfile.geminiVoiceName || baseProfile.name);
      audioBase64ForCache = audioBuffer.toString("base64");
    } else {
      const accessToken = await getGoogleAccessToken(providerKey);

      const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
        method: "POST",
        headers: {
          "Authorization": \`Bearer \${accessToken}\`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          input: {
            text
          },
          voice: {
            languageCode: "cmn-TW",
            name: baseProfile.name,
            ssmlGender: baseProfile.ssmlGender
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate,
            pitch,
            volumeGainDb
          }
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.audioContent) {
        return NextResponse.json(
          {
            error: data?.error?.message || "Google Cloud TTS 產生語音失敗，已退回瀏覽器語音。",
            fallbackToBrowser: true,
            status: response.status,
            detail: data
          },
          { status: response.status || 502 }
        );
      }

      audioBuffer = Buffer.from(data.audioContent, "base64");
      audioBase64ForCache = data.audioContent;
    }

    if (!isPreview) {
      await saveCachedAudioBase64({
        cacheKey,
        textHash,
        cleanedText: text,
        voiceName: baseProfile.name,
        voiceGender: baseProfile.ssmlGender,
        speakingRate,
        pitch,
        volumeGainDb,
        cacheVersion,
        providerKey,
        charCount,
        audioBase64: audioBase64ForCache
      });
    }`
);

replaceApi(
  "final content type",
  `        "Content-Type": "audio/mpeg",`,
  `        "Content-Type": baseProfile.engine === "gemini" ? "audio/wav" : "audio/mpeg",`
);

replaceApi(
  "final family",
  `        "X-Voice-Family": "cmn-TW-Wavenet",`,
  `        "X-Voice-Family": baseProfile.engine === "gemini" ? "gemini-2.5-flash-preview-tts" : "cmn-TW-Wavenet",`
);

if (changedPage) fs.writeFileSync(pagePath, page, "utf8");
if (changedApi) fs.writeFileSync(voiceApiPath, voiceApi, "utf8");

console.log("[zephyr-iapetus] page changed:", changedPage);
console.log("[zephyr-iapetus] api changed:", changedApi);
