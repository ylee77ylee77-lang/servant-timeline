import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { createHash, createSign } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIMARY_DEFAULT_LIMIT = 4_000_000;
const BACKUP_DEFAULT_LIMIT = 4_000_000;

const VOICE_PROFILE_MAP: Record<string, { name: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number; volumeGainDb: number }> = {
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
};

const DEFAULT_GLOBAL_VOICE_SETTINGS = {
  voice_gender: "female",
  speaking_rate: 0.92,
  pitch: 1.5,
  volume_gain_db: 0,
  cache_version: "v1"
};

let cachedAccessTokens: Record<string, { token: string; expiresAt: number }> = {};

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const cleanTextForTtsBilling = (value: unknown) => {
  return String(value || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\r\n\t]+/g, "")
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？、；：,.!?;:"“”'‘’「」『』（）()【】\[\]《》〈〉…—–_~～·・•]/g, "")
    .replace(/[✅☑️✔️❌⭕⭐🌟✨🔥💡📌📍👉👈🙏🙌🎉🔔]/g, "")
    .trim();
};

const normalizeSupabaseUrl = (value: string | undefined) => {
  const raw = String(value || "").trim();
  const markdownMatch = raw.match(/^\[(https?:\/\/[^\]]+)\]\(https?:\/\/[^\)]+\)$/);
  return (markdownMatch ? markdownMatch[1] : raw).replace(/\/+$/g, "");
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const getSupabaseConfig = () => {
  const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY;

  return { supabaseUrl, serviceRoleKey };
};

const getTaipeiParts = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const pick = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute")
  };
};

const getMonthKey = () => {
  const taipei = getTaipeiParts();
  return `${taipei.year}-${String(taipei.month).padStart(2, "0")}`;
};

const getTextCharCount = (text: string) => Array.from(text).length;

const base64UrlEncode = (value: Buffer | string) => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const parseServiceAccountJson = (rawJson: string | undefined) => {
  if (!rawJson) return null;
  const parsed = JSON.parse(rawJson);
  return {
    clientEmail: parsed.client_email,
    privateKey: String(parsed.private_key || "").replace(/\\n/g, "\n")
  };
};

const getServiceAccount = (providerKey: string) => {
  const isBackup = providerKey === "backup";
  const rawJson = isBackup
    ? process.env.GOOGLE_TTS_BACKUP_SERVICE_ACCOUNT_JSON
    : (process.env.GOOGLE_TTS_PRIMARY_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON);

  const parsed = parseServiceAccountJson(rawJson);
  if (parsed) return parsed;

  if (!isBackup) {
    return {
      clientEmail: process.env.GOOGLE_TTS_CLIENT_EMAIL,
      privateKey: String(process.env.GOOGLE_TTS_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    };
  }

  return {
    clientEmail: process.env.GOOGLE_TTS_BACKUP_CLIENT_EMAIL,
    privateKey: String(process.env.GOOGLE_TTS_BACKUP_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
};

const hasProviderCredentials = (providerKey: string) => {
  const account = getServiceAccount(providerKey);
  return Boolean(account.clientEmail && account.privateKey);
};

const getGoogleAccessToken = async (providerKey: string) => {
  const cached = cachedAccessTokens[providerKey];

  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const { clientEmail, privateKey } = getServiceAccount(providerKey);

  if (!clientEmail || !privateKey) {
    throw new Error(providerKey === "backup"
      ? "缺少備用 Google Cloud TTS service account。請設定 GOOGLE_TTS_BACKUP_SERVICE_ACCOUNT_JSON。"
      : "缺少主 Google Cloud TTS service account。請設定 GOOGLE_TTS_PRIMARY_SERVICE_ACCOUNT_JSON 或 GOOGLE_TTS_SERVICE_ACCOUNT_JSON。");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();

  const signature = signer.sign(privateKey);
  const jwt = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "無法取得 Google Cloud access token。");
  }

  cachedAccessTokens[providerKey] = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };

  return cachedAccessTokens[providerKey].token;
};

const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);
const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000);

const getDefaultUsageSnapshot = () => {
  const primaryLimit = getPrimaryLimit();
  const backupLimit = hasProviderCredentials("backup") ? getBackupLimit() : 0;
  const totalLimit = primaryLimit + backupLimit;

  return {
    month: getMonthKey(),
    primary: { usedChars: 0, limitChars: primaryLimit, remainingChars: primaryLimit },
    backup: { usedChars: 0, limitChars: backupLimit, remainingChars: backupLimit },
    total: { usedChars: 0, limitChars: totalLimit, remainingChars: totalLimit, usageRate: 0 }
  };
};

const getUsageSnapshot = async () => {
  const snapshot = getDefaultUsageSnapshot();
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) return snapshot;

  const response = await fetch(`${supabaseUrl}/rest/v1/tts_usage_monthly_by_provider?month=eq.${snapshot.month}&select=*`, {
    method: "GET",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) return snapshot;

  const rows = await response.json().catch(() => []);
  const primaryRow = Array.isArray(rows) ? rows.find((row: any) => row.provider_key === "primary") : null;
  const backupRow = Array.isArray(rows) ? rows.find((row: any) => row.provider_key === "backup") : null;

  const primaryUsed = Number(primaryRow?.used_chars || 0);
  const backupUsed = Number(backupRow?.used_chars || 0);
  const primaryLimit = Number(primaryRow?.limit_chars || snapshot.primary.limitChars);
  const backupLimit = Number(backupRow?.limit_chars || snapshot.backup.limitChars);
  const totalUsed = primaryUsed + backupUsed;
  const totalLimit = primaryLimit + backupLimit;

  return {
    month: snapshot.month,
    primary: {
      usedChars: primaryUsed,
      limitChars: primaryLimit,
      remainingChars: Math.max(0, primaryLimit - primaryUsed)
    },
    backup: {
      usedChars: backupUsed,
      limitChars: backupLimit,
      remainingChars: Math.max(0, backupLimit - backupUsed)
    },
    total: {
      usedChars: totalUsed,
      limitChars: totalLimit,
      remainingChars: Math.max(0, totalLimit - totalUsed),
      usageRate: totalLimit > 0 ? Math.round((totalUsed * 1000) / totalLimit) / 10 : 0
    }
  };
};

const reserveMonthlyCharacters = async (chars: number) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  const month = getMonthKey();
  const primaryLimit = getPrimaryLimit();
  const backupLimit = hasProviderCredentials("backup") ? getBackupLimit() : 0;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      allowed: false,
      providerKey: "",
      usedChars: 0,
      remainingChars: 0,
      reason: "missing_usage_counter"
    };
  }

  const v2Response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_tts_chars_v2`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_month: month,
      p_chars: chars,
      p_primary_limit: primaryLimit,
      p_backup_limit: backupLimit
    })
  });

  const v2Data = await v2Response.json().catch(() => null);

  if (v2Response.ok) {
    const row = Array.isArray(v2Data) ? v2Data[0] : v2Data;

    return {
      allowed: row?.allowed === true,
      providerKey: String(row?.provider_key || ""),
      usedChars: Number(row?.total_used_chars || 0),
      remainingChars: Number(row?.total_remaining_chars || 0),
      reason: row?.allowed === true ? "" : "monthly_limit_reached",
      detail: row
    };
  }

  const fallbackLimit = Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);
  const fallbackResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_tts_chars`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_month: month,
      p_chars: chars,
      p_limit: fallbackLimit
    })
  });

  const fallbackData = await fallbackResponse.json().catch(() => null);

  if (!fallbackResponse.ok) {
    return {
      allowed: false,
      providerKey: "",
      usedChars: 0,
      remainingChars: 0,
      reason: "counter_error",
      detail: v2Data || fallbackData
    };
  }

  const row = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData;

  return {
    allowed: row?.allowed === true,
    providerKey: "primary",
    usedChars: Number(row?.used_chars || 0),
    remainingChars: Number(row?.remaining_chars || 0),
    reason: row?.allowed === true ? "" : "monthly_limit_reached"
  };
};

const getGlobalVoiceSettings = async () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) {
    return DEFAULT_GLOBAL_VOICE_SETTINGS;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/app_voice_settings?id=eq.global&select=*`, {
    method: "GET",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) return DEFAULT_GLOBAL_VOICE_SETTINGS;

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) return DEFAULT_GLOBAL_VOICE_SETTINGS;

  return {
    voice_gender: row.voice_gender === "male" ? "male" : "female",
    speaking_rate: clampNumber(row.speaking_rate, DEFAULT_GLOBAL_VOICE_SETTINGS.speaking_rate, 0.8, 1.1),
    pitch: clampNumber(row.pitch, DEFAULT_GLOBAL_VOICE_SETTINGS.pitch, -2, 8),
    volume_gain_db: clampNumber(row.volume_gain_db, DEFAULT_GLOBAL_VOICE_SETTINGS.volume_gain_db, -6, 3),
    cache_version: String(row.cache_version || "v1")
  };
};

const createSharedAudioCacheKey = (cleanedText: string, profile: { name: string; ssmlGender: "FEMALE" | "MALE" }, settings: { speakingRate: number; pitch: number; volumeGainDb: number; cacheVersion: string }) => {
  const input = [
    "google-cloud-tts",
    "cmn-TW-Wavenet",
    profile.name,
    profile.ssmlGender,
    settings.speakingRate,
    settings.pitch,
    settings.volumeGainDb,
    settings.cacheVersion,
    cleanedText
  ].join("|");

  return createHash("sha256").update(input).digest("hex");
};

const getCachedAudioBase64 = async (cacheKey: string) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) return null;

  const response = await fetch(`${supabaseUrl}/rest/v1/tts_audio_cache?cache_key=eq.${cacheKey}&select=audio_base64,char_count`, {
    method: "GET",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) return null;

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row?.audio_base64) return null;

  fetch(`${supabaseUrl}/rest/v1/tts_audio_cache?cache_key=eq.${cacheKey}`, {
    method: "PATCH",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({
      last_accessed_at: new Date().toISOString(),
      hit_count: Number(row.hit_count || 0) + 1
    })
  }).catch(() => null);

  return String(row.audio_base64);
};

const saveCachedAudioBase64 = async (payload: {
  cacheKey: string;
  textHash: string;
  cleanedText: string;
  voiceName: string;
  voiceGender: string;
  speakingRate: number;
  pitch: number;
  volumeGainDb: number;
  cacheVersion: string;
  providerKey: string;
  charCount: number;
  audioBase64: string;
}) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl}/rest/v1/tts_audio_cache?on_conflict=cache_key`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=ignore-duplicates,return=minimal"
    },
    body: JSON.stringify({
      cache_key: payload.cacheKey,
      text_hash: payload.textHash,
      cleaned_text: payload.cleanedText,
      voice_name: payload.voiceName,
      voice_gender: payload.voiceGender,
      speaking_rate: payload.speakingRate,
      pitch: payload.pitch,
      volume_gain_db: payload.volumeGainDb,
      cache_version: payload.cacheVersion,
      provider_key: payload.providerKey,
      char_count: payload.charCount,
      audio_base64: payload.audioBase64,
      audio_encoding: "MP3",
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      hit_count: 0
    })
  }).catch(() => null);
};

const getServiceCloseMinutes = (serviceType: string) => {
  const map: Record<string, number> = {
    "六晚崇": 21 * 60 + 45,
    "主一堂": 10 * 60 + 15,
    "主二堂": 12 * 60 + 45
  };

  return map[serviceType] ?? null;
};

const getServiceBlockReason = (serviceType: string, checkinDay: unknown) => {
  const taipei = getTaipeiParts();
  const numericCheckinDay = Number(checkinDay || 0);

  if (numericCheckinDay && numericCheckinDay !== taipei.day) {
    return {
      blocked: true,
      reason: "service_date_expired",
      message: "本場服事已不是今天，語音助理已關閉。"
    };
  }

  const closeMinutes = getServiceCloseMinutes(serviceType);
  if (closeMinutes === null) return { blocked: false, reason: "", message: "" };

  const currentMinutes = taipei.hour * 60 + taipei.minute;
  if (currentMinutes >= closeMinutes) {
    return {
      blocked: true,
      reason: "service_closed",
      message: "本場服事已結束，語音助理已關閉。"
    };
  }

  return { blocked: false, reason: "", message: "" };
};

export async function GET() {
  const settings = await getGlobalVoiceSettings();
  const usage = await getUsageSnapshot();

  return NextResponse.json({
    ok: true,
    route: "/api/voice",
    engine: "google-cloud-text-to-speech",
    voiceFamily: "cmn-TW-Wavenet",
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawText = normalizeInput(body.text);
    const text = cleanTextForTtsBilling(rawText);
    const isPreview = body.preview === true;
    const serviceType = normalizeInput(body.serviceType || body.currentService || "");

    if (!text) {
      return NextResponse.json({ error: "缺少要產生語音的文字。", fallbackToBrowser: true }, { status: 400 });
    }

    if (text.length > 600) {
      return NextResponse.json({ error: "語音文字過長，請縮短到 600 字以內。", fallbackToBrowser: true }, { status: 400 });
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

    const voiceProfile = isPreview
      ? (normalizeInput(body.voiceProfile) || "young_female")
      : (globalSettings.voice_gender === "male" ? "mature_male" : "young_female");

    const baseProfile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;

    const speakingRate = previewTuning
      ? clampNumber(previewTuning.speakingRate, baseProfile.speakingRate, 0.8, 1.1)
      : clampNumber(globalSettings.speaking_rate, baseProfile.speakingRate, 0.8, 1.1);

    const pitch = previewTuning
      ? clampNumber(previewTuning.pitch, baseProfile.pitch, -2, 8)
      : clampNumber(globalSettings.pitch, baseProfile.pitch, -2, 8);

    const volumeGainDb = previewTuning
      ? clampNumber(previewTuning.volumeGainDb, baseProfile.volumeGainDb, -6, 3)
      : clampNumber(globalSettings.volume_gain_db, baseProfile.volumeGainDb, -6, 3);

    const cacheVersion = isPreview ? "preview" : String(globalSettings.cache_version || "v1");
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
            "X-Voice-Engine": "google-cloud-tts",
            "X-Voice-Family": "cmn-TW-Wavenet",
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
            ? "Google Cloud TTS 本月字元上限已達，已退回瀏覽器語音。"
            : "Google Cloud TTS 用量控管尚未設定完成，已退回瀏覽器語音。",
          fallbackToBrowser: true,
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
        "Authorization": `Bearer ${accessToken}`,
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

    const audioBuffer = Buffer.from(data.audioContent, "base64");

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile,
        "X-Voice-Engine": "google-cloud-tts",
        "X-Voice-Family": "cmn-TW-Wavenet",
        "X-Voice-Cache": isPreview ? "preview-bypass" : "shared-miss",
        "X-Voice-Provider": providerKey,
        "X-TTS-Chars": String(charCount),
        "X-TTS-Remaining-Chars": String(reservation.remainingChars)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Google Cloud TTS 產生語音失敗。";
    return NextResponse.json({ error: message, fallbackToBrowser: true }, { status: 500 });
  }
}
