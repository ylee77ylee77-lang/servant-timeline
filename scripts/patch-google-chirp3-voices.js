const fs = require("fs");
const path = require("path");

const pagePath = path.join(process.cwd(), "app", "page.tsx");
const voiceApiPath = path.join(process.cwd(), "app", "api", "voice", "route.ts");

let changed = false;

const replaceRegex = (source, pattern, to, label) => {
  if (!pattern.test(source)) {
    console.warn("[chirp3-voices] " + label + " target not found; skipped.");
    return source;
  }
  changed = true;
  console.log("[chirp3-voices] " + label + " patched.");
  return source.replace(pattern, to);
};

const replaceAll = (source, from, to, label) => {
  if (!source.includes(from)) return source;
  changed = true;
  console.log("[chirp3-voices] " + label + " patched.");
  return source.split(from).join(to);
};

if (fs.existsSync(voiceApiPath)) {
  let api = fs.readFileSync(voiceApiPath, "utf8");

  const chirpProfileMap = `const VOICE_PROFILE_MAP: Record<string, { name: string; languageCode: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number; engine: "google" }> = {
  zephyr: {
    name: "cmn-CN-Chirp3-HD-Zephyr",
    languageCode: "cmn-CN",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0,
    engine: "google"
  },
  iapetus: {
    name: "cmn-CN-Chirp3-HD-Iapetus",
    languageCode: "cmn-CN",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0,
    engine: "google"
  },
  young_female: {
    name: "cmn-CN-Chirp3-HD-Zephyr",
    languageCode: "cmn-CN",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0,
    engine: "google"
  },
  mature_male: {
    name: "cmn-CN-Chirp3-HD-Iapetus",
    languageCode: "cmn-CN",
    ssmlGender: "MALE",
    speakingRate: 0.92,
    pitch: 0,
    volumeGainDb: 0,
    engine: "google"
  }
};

const DEFAULT_GLOBAL_VOICE_SETTINGS`;

  api = replaceRegex(
    api,
    /const VOICE_PROFILE_MAP:[\s\S]*?\n};\n\nconst DEFAULT_GLOBAL_VOICE_SETTINGS/,
    chirpProfileMap,
    "force Chirp 3 HD profile map"
  );

  const chirpCacheKey = `const createSharedAudioCacheKey = (cleanedText: string, profile: { name: string; languageCode?: string; ssmlGender: "FEMALE" | "MALE" }, settings: { speakingRate: number; pitch: number; volumeGainDb: number; cacheVersion: string }) => {
  const input = [
    "google-cloud-chirp3-hd",
    "cmn-CN-Chirp3-HD-v2",
    profile.name,
    profile.languageCode || "cmn-CN",
    profile.ssmlGender,
    settings.speakingRate,
    settings.pitch,
    settings.volumeGainDb,
    settings.cacheVersion,
    cleanedText
  ].join("|");

  return createHash("sha256").update(input).digest("hex");
};

const getCachedAudioBase64`;

  api = replaceRegex(
    api,
    /const createSharedAudioCacheKey[\s\S]*?\n};\n\nconst getCachedAudioBase64/,
    chirpCacheKey,
    "force Chirp 3 HD cache key"
  );

  const chirpGet = `export async function GET() {
  const settings = await getGlobalVoiceSettings();
  const usage = await getUsageSnapshot();

  return NextResponse.json({
    ok: true,
    route: "/api/voice",
    engine: "google-cloud-text-to-speech",
    voiceFamily: "cmn-CN-Chirp3-HD",
    chirp3Voices: ["cmn-CN-Chirp3-HD-Zephyr", "cmn-CN-Chirp3-HD-Iapetus"],
    chirp3TestMode: true,
    geminiTtsDisabled: true,
    textCleaner: true,
    sharedAudioCache: true,
    currentGlobalVoiceSettings: settings,
    hasGoogleTtsCredentials: hasProviderCredentials("primary"),
    hasBackupGoogleTtsCredentials: hasProviderCredentials("backup"),
    hasUsageCounter: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY)),
    primaryCharLimit: getPrimaryLimit(),
    backupCharLimit: hasProviderCredentials("backup") ? getBackupLimit() : 0,
    monthlyCharLimit: usage.total.limitChars,
    usage
  });
}

export async function POST`;

  api = replaceRegex(
    api,
    /export async function GET\(\) \{[\s\S]*?\n}\n\nexport async function POST/,
    chirpGet,
    "force Chirp 3 HD diagnostics"
  );

  const chirpPost = `export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawText = normalizeInput(body.text);
    const text = cleanTextForTtsBilling(rawText);
    const isPreview = body.preview === true;
    const serviceType = normalizeInput(body.serviceType || body.currentService || "");

    if (!text) {
      return NextResponse.json({ error: "缺少要產生語音的文字。", fallbackToBrowser: false }, { status: 400 });
    }

    if (text.length > 600) {
      return NextResponse.json({ error: "語音文字過長，請縮短到 600 字以內。", fallbackToBrowser: false }, { status: 400 });
    }

    if (!isPreview && serviceType) {
      const blockState = getServiceBlockReason(serviceType, body.checkinDay);

      if (blockState.blocked) {
        return NextResponse.json(
          {
            error: blockState.message,
            fallbackToBrowser: false,
            reason: blockState.reason
          },
          { status: 403 }
        );
      }
    }

    const globalSettings = await getGlobalVoiceSettings();
    const previewTuning = isPreview && body.voiceTuning ? body.voiceTuning : null;
    const requestedVoiceProfile = normalizeInput(body.voiceProfile);
    const voiceProfile = isPreview
      ? (requestedVoiceProfile === "iapetus" || requestedVoiceProfile === "mature_male" ? "iapetus" : "zephyr")
      : (globalSettings.voice_gender === "male" ? "iapetus" : "zephyr");

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.zephyr;

    const speakingRate = previewTuning
      ? clampNumber(previewTuning.speakingRate, baseProfile.speakingRate, 0.8, 1.1)
      : clampNumber(globalSettings.speaking_rate, baseProfile.speakingRate, 0.8, 1.1);

    const pitch = previewTuning
      ? clampNumber(previewTuning.pitch, baseProfile.pitch, -2, 8)
      : clampNumber(globalSettings.pitch, baseProfile.pitch, -2, 8);

    const volumeGainDb = previewTuning
      ? clampNumber(previewTuning.volumeGainDb, baseProfile.volumeGainDb, -6, 3)
      : clampNumber(globalSettings.volume_gain_db, baseProfile.volumeGainDb, -6, 3);

    const cacheVersion = isPreview
      ? "preview-chirp3-hd-v2"
      : "chirp3-hd-v2|" + String(globalSettings.cache_version || "v1");
    const cacheKey = createSharedAudioCacheKey(text, baseProfile, { speakingRate, pitch, volumeGainDb, cacheVersion });
    const textHash = createHash("sha256").update(text).digest("hex");

    if (!isPreview) {
      const cachedAudioBase64 = await getCachedAudioBase64(cacheKey);

      if (cachedAudioBase64) {
        const audioBuffer = Buffer.from(cachedAudioBase64, "base64");

        return new NextResponse(new Uint8Array(audioBuffer), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Voice-Profile": voiceProfile,
            "X-Voice-Engine": "google-cloud-chirp3-hd",
            "X-Voice-Family": "cmn-CN-Chirp3-HD",
            "X-Voice-Name": baseProfile.name,
            "X-Voice-Language": baseProfile.languageCode,
            "X-Voice-Cache": "shared-hit",
            "X-TTS-Chars": "0",
            "X-TTS-Cleaned-Chars": String(getTextCharCount(text))
          }
        });
      }
    }

    const charCount = getTextCharCount(text);
    const reservation = await reserveMonthlyCharacters(charCount);

    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error: reservation.reason === "monthly_limit_reached"
            ? "Google Cloud Chirp 3 HD 本月字元上限已達，已停止產生語音。"
            : "Google Cloud TTS 用量控管尚未設定完成，已停止產生語音。",
          fallbackToBrowser: false,
          reason: reservation.reason,
          usedChars: reservation.usedChars,
          remainingChars: reservation.remainingChars
        },
        { status: 429 }
      );
    }

    const providerKey = reservation.providerKey || "primary";
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
          languageCode: baseProfile.languageCode || "cmn-CN",
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
      console.error("Google Chirp 3 HD TTS failed", { status: response.status, voiceName: baseProfile.name, detail: data?.error || data });
      return NextResponse.json(
        {
          error: data?.error?.message || "Google Cloud Chirp 3 HD 產生語音失敗。",
          fallbackToBrowser: false,
          status: response.status,
          voiceName: baseProfile.name,
          voiceFamily: "cmn-CN-Chirp3-HD",
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

    const audioBuffer = Buffer.from(data.audioContent, "base64");

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile,
        "X-Voice-Engine": "google-cloud-chirp3-hd",
        "X-Voice-Family": "cmn-CN-Chirp3-HD",
        "X-Voice-Name": baseProfile.name,
        "X-Voice-Language": baseProfile.languageCode,
        "X-Voice-Cache": isPreview ? "preview-bypass" : "shared-miss",
        "X-Voice-Provider": providerKey,
        "X-TTS-Chars": String(charCount),
        "X-TTS-Remaining-Chars": String(reservation.remainingChars)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Google Cloud Chirp 3 HD 產生語音失敗。";
    console.error("Google Chirp 3 HD TTS unhandled error", { message });
    return NextResponse.json({ error: message, fallbackToBrowser: false }, { status: 500 });
  }
}
`;

  api = replaceRegex(
    api,
    /export async function POST\(request: NextRequest\) \{[\s\S]*$/,
    chirpPost,
    "force Chirp 3 HD POST implementation"
  );

  // Remove misleading diagnostics/log labels left by older Gemini-oriented patches.
  api = replaceAll(api, "Gemini TTS failed", "Google Chirp 3 HD TTS failed", "remove Gemini log wording");
  api = replaceAll(api, "gemini-2.5-flash-preview-tts", "cmn-CN-Chirp3-HD", "remove Gemini family wording");

  fs.writeFileSync(voiceApiPath, api, "utf8");
}

if (fs.existsSync(pagePath)) {
  let page = fs.readFileSync(pagePath, "utf8");
  page = replaceAll(page, "Gemini TTS：女聲 Zephyr、男聲 Iapetus", "Google Cloud Chirp 3 HD：Zephyr / Iapetus 測試", "page engine label");
  page = replaceAll(page, "語音助理由 Gemini TTS 的 Zephyr / Iapetus 產生；音調、語速與柔和度會轉成自然語音提示。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生，先測試自然度；目前可能較偏普通話口音。", "page engine description");
  page = replaceAll(page, "Gemini TTS 目前沒有成功產生音檔，已停止試聽，避免誤播瀏覽器舊聲音。請檢查 Vercel 的 GEMINI_API_KEY 或 Gemini TTS 額度。", "Google Cloud Chirp 3 HD 目前沒有成功產生音檔，已停止試聽。請檢查 Google Cloud TTS 權限或 Chirp 3 HD 聲音名稱。", "preview failure message");
  page = replaceAll(page, "語音助理由 Google Cloud TTS 固定男女聲產生，管理員可調整語速、音高與音量。", "語音助理由 Google Cloud Chirp 3 HD 的 Zephyr / Iapetus 產生，先測試自然度；目前可能較偏普通話口音。", "legacy voice description");
  fs.writeFileSync(pagePath, page, "utf8");
}

console.log(changed ? "[chirp3-voices] forced Chirp 3 HD voice API applied." : "[chirp3-voices] no changes needed.");
