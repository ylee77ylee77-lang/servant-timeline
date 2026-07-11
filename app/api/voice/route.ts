import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { createHash, createSign } from "node:crypto";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_FREE_TIER_LIMIT = 1_000_000;
const GOOGLE_TTS_TIMEOUT_MS = 20_000;
const MAX_SPEECH_CHARS = 600;
const RATE_WINDOW_MS = 60_000;
const REGULAR_REQUESTS_PER_WINDOW = 120;
const PREVIEW_REQUESTS_PER_WINDOW = 20;

type ProviderKey = "primary" | "backup";
type VoiceProfileKey = "zephyr" | "iapetus";

type VoiceProfile = {
  name: string;
  languageCode: "cmn-CN";
  ssmlGender: "FEMALE" | "MALE";
  speakingRate: number;
};

type VoiceSettings = {
  voice_gender: "female" | "male";
  voice_profile: VoiceProfileKey;
  speaking_rate: number;
  pitch: number;
  volume_gain_db: number;
  cache_version: string;
};

type UsageProviderSnapshot = {
  usedChars: number;
  limitChars: number;
  remainingChars: number;
};

type UsageSnapshot = {
  month: string;
  primary: UsageProviderSnapshot;
  backup: UsageProviderSnapshot;
  total: UsageProviderSnapshot & { usageRate: number };
};

const VOICE_PROFILE_MAP: Record<VoiceProfileKey, VoiceProfile> = {
  zephyr: {
    name: "cmn-CN-Chirp3-HD-Zephyr",
    languageCode: "cmn-CN",
    ssmlGender: "FEMALE",
    speakingRate: 0.92
  },
  iapetus: {
    name: "cmn-CN-Chirp3-HD-Iapetus",
    languageCode: "cmn-CN",
    ssmlGender: "MALE",
    speakingRate: 0.92
  }
};

const DEFAULT_GLOBAL_VOICE_SETTINGS: VoiceSettings = {
  voice_gender: "female",
  voice_profile: "zephyr",
  speaking_rate: 0.92,
  pitch: 0,
  volume_gain_db: 0,
  cache_version: "chirp3-v3"
};

const cachedAccessTokens: Partial<Record<ProviderKey, { token: string; expiresAt: number }>> = {};
const rateBuckets = new Map<string, { count: number; windowStartedAt: number }>();

const normalizeInput = (value: unknown) => String(value ?? "").trim();

const normalizeSpeechText = (value: unknown) => {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

const getTextCharCount = (text: string) => Array.from(text).length;

const normalizeSupabaseUrl = (value: string | undefined) => {
  const raw = String(value || "").trim();
  const markdownMatch = raw.match(/^\[(https?:\/\/[^\]]+)\]\(https?:\/\/[^\)]+\)$/);
  return (markdownMatch ? markdownMatch[1] : raw).replace(/\/+$/g, "");
};

const getSupabaseConfig = () => {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL
  );
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY;

  return { supabaseUrl, serviceRoleKey };
};

const parseLimit = (value: string | undefined, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.min(PROVIDER_FREE_TIER_LIMIT, Math.floor(numeric));
};

const parseServiceAccountJson = (rawJson: string | undefined) => {
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson);
    return {
      clientEmail: String(parsed.client_email || ""),
      privateKey: String(parsed.private_key || "").replace(/\\n/g, "\n")
    };
  } catch {
    return null;
  }
};

const getServiceAccount = (providerKey: ProviderKey) => {
  const isBackup = providerKey === "backup";
  const rawJson = isBackup
    ? process.env.GOOGLE_TTS_BACKUP_SERVICE_ACCOUNT_JSON
    : process.env.GOOGLE_TTS_PRIMARY_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;

  const parsed = parseServiceAccountJson(rawJson);
  if (parsed) return parsed;

  if (isBackup) {
    return {
      clientEmail: String(process.env.GOOGLE_TTS_BACKUP_CLIENT_EMAIL || ""),
      privateKey: String(process.env.GOOGLE_TTS_BACKUP_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    };
  }

  return {
    clientEmail: String(process.env.GOOGLE_TTS_CLIENT_EMAIL || ""),
    privateKey: String(process.env.GOOGLE_TTS_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
};

const hasProviderCredentials = (providerKey: ProviderKey) => {
  const account = getServiceAccount(providerKey);
  return Boolean(account.clientEmail && account.privateKey);
};

const getPrimaryLimit = () =>
  parseLimit(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT, PROVIDER_FREE_TIER_LIMIT);

const getBackupLimit = () =>
  hasProviderCredentials("backup")
    ? parseLimit(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT, PROVIDER_FREE_TIER_LIMIT)
    : 0;

const base64UrlEncode = (value: Buffer | string) => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const getGoogleAccessToken = async (providerKey: ProviderKey) => {
  const cached = cachedAccessTokens[providerKey];
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const { clientEmail, privateKey } = getServiceAccount(providerKey);
  if (!clientEmail || !privateKey) {
    throw new Error(
      providerKey === "backup"
        ? "缺少備用 Google Cloud TTS service account。"
        : "缺少主 Google Cloud TTS service account。"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const jwt = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    }),
    cache: "no-store"
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "無法取得 Google Cloud access token。");
  }

  const tokenEntry = {
    token: String(data.access_token),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };
  cachedAccessTokens[providerKey] = tokenEntry;
  return tokenEntry.token;
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

const getDefaultUsageSnapshot = (): UsageSnapshot => {
  const primaryLimit = hasProviderCredentials("primary") ? getPrimaryLimit() : 0;
  const backupLimit = getBackupLimit();
  const totalLimit = primaryLimit + backupLimit;

  return {
    month: getMonthKey(),
    primary: { usedChars: 0, limitChars: primaryLimit, remainingChars: primaryLimit },
    backup: { usedChars: 0, limitChars: backupLimit, remainingChars: backupLimit },
    total: {
      usedChars: 0,
      limitChars: totalLimit,
      remainingChars: totalLimit,
      usageRate: 0
    }
  };
};

const getUsageState = async (): Promise<{ snapshot: UsageSnapshot; healthy: boolean; reason: string }> => {
  const snapshot = getDefaultUsageSnapshot();
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) {
    return { snapshot, healthy: false, reason: "missing_usage_counter" };
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/tts_usage_monthly_by_provider?month=eq.${snapshot.month}&select=*`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return { snapshot, healthy: false, reason: `usage_counter_http_${response.status}` };
    }

    const rows = await response.json().catch(() => []);
    const primaryRow = Array.isArray(rows)
      ? rows.find((row: any) => row.provider_key === "primary")
      : null;
    const backupRow = Array.isArray(rows)
      ? rows.find((row: any) => row.provider_key === "backup")
      : null;

    const primaryUsed = Math.max(0, Number(primaryRow?.used_chars || 0));
    const backupUsed = Math.max(0, Number(backupRow?.used_chars || 0));
    const primaryLimit = snapshot.primary.limitChars;
    const backupLimit = snapshot.backup.limitChars;
    const totalUsed = primaryUsed + backupUsed;
    const totalLimit = primaryLimit + backupLimit;

    return {
      healthy: true,
      reason: "",
      snapshot: {
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
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "usage_counter_error";
    return { snapshot, healthy: false, reason: message };
  }
};

const commitMonthlyCharacters = async (chars: number) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) {
    return { committed: false, providerKey: "" as const, reason: "missing_usage_counter" };
  }

  const month = getMonthKey();
  const primaryLimit = getPrimaryLimit();
  const backupLimit = getBackupLimit();

  const v2Response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_tts_chars_v2`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_month: month,
      p_chars: chars,
      p_primary_limit: primaryLimit,
      p_backup_limit: backupLimit
    }),
    cache: "no-store"
  });

  const v2Data = await v2Response.json().catch(() => null);
  if (v2Response.ok) {
    const row = Array.isArray(v2Data) ? v2Data[0] : v2Data;
    return {
      committed: row?.allowed === true,
      providerKey: String(row?.provider_key || ""),
      reason: row?.allowed === true ? "" : "monthly_limit_reached",
      remainingChars: Number(row?.total_remaining_chars || 0)
    };
  }

  const fallbackResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_tts_chars`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_month: month,
      p_chars: chars,
      p_limit: primaryLimit + backupLimit
    }),
    cache: "no-store"
  });

  const fallbackData = await fallbackResponse.json().catch(() => null);
  if (!fallbackResponse.ok) {
    return { committed: false, providerKey: "", reason: "counter_error" };
  }

  const row = Array.isArray(fallbackData) ? fallbackData[0] : fallbackData;
  return {
    committed: row?.allowed === true,
    providerKey: "primary",
    reason: row?.allowed === true ? "" : "monthly_limit_reached",
    remainingChars: Number(row?.remaining_chars || 0)
  };
};

const selectProvider = (usage: UsageSnapshot, charCount: number): ProviderKey | null => {
  if (
    hasProviderCredentials("primary") &&
    usage.primary.limitChars > 0 &&
    usage.primary.remainingChars >= charCount
  ) {
    return "primary";
  }

  if (
    hasProviderCredentials("backup") &&
    usage.backup.limitChars > 0 &&
    usage.backup.remainingChars >= charCount
  ) {
    return "backup";
  }

  return null;
};

const getGlobalVoiceSettings = async (): Promise<VoiceSettings> => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return DEFAULT_GLOBAL_VOICE_SETTINGS;

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/app_voice_settings?id=eq.global&select=*`,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) return DEFAULT_GLOBAL_VOICE_SETTINGS;

    const rows = await response.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return DEFAULT_GLOBAL_VOICE_SETTINGS;

    const voiceGender: "female" | "male" = row.voice_gender === "male" ? "male" : "female";
    return {
      voice_gender: voiceGender,
      voice_profile: voiceGender === "male" ? "iapetus" : "zephyr",
      speaking_rate: clampNumber(row.speaking_rate, 0.92, 0.8, 1.1),
      pitch: clampNumber(row.pitch, 0, -2, 8),
      volume_gain_db: clampNumber(row.volume_gain_db, 0, -6, 3),
      cache_version: String(row.cache_version || "chirp3-v3")
    };
  } catch {
    return DEFAULT_GLOBAL_VOICE_SETTINGS;
  }
};

const resolveVoiceProfile = (
  requestedProfile: unknown,
  globalSettings: VoiceSettings,
  isPreview: boolean
): VoiceProfileKey => {
  const requested = normalizeInput(requestedProfile).toLowerCase();

  if (requested === "iapetus" || requested === "mature_male" || requested === "male") {
    return "iapetus";
  }

  if (requested === "zephyr" || requested === "young_female" || requested === "female") {
    return "zephyr";
  }

  if (isPreview) return globalSettings.voice_profile;
  return globalSettings.voice_profile;
};

const createSharedAudioCacheKey = (
  speechText: string,
  profile: VoiceProfile,
  speakingRate: number,
  cacheVersion: string
) => {
  return createHash("sha256")
    .update(
      [
        "google-cloud-chirp3-hd",
        "cmn-CN-Chirp3-HD-v3",
        profile.name,
        profile.languageCode,
        speakingRate,
        cacheVersion,
        speechText
      ].join("|")
    )
    .digest("hex");
};

const getCachedAudioBase64 = async (cacheKey: string) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;

  const response = await fetch(
    `${supabaseUrl}/rest/v1/tts_audio_cache?cache_key=eq.${cacheKey}&select=audio_base64,hit_count`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) return null;

  const rows = await response.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.audio_base64) return null;

  void fetch(`${supabaseUrl}/rest/v1/tts_audio_cache?cache_key=eq.${cacheKey}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
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
  speechText: string;
  voiceName: string;
  voiceGender: string;
  speakingRate: number;
  cacheVersion: string;
  providerKey: ProviderKey;
  charCount: number;
  audioBase64: string;
}) => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return;

  await fetch(`${supabaseUrl}/rest/v1/tts_audio_cache?on_conflict=cache_key`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal"
    },
    body: JSON.stringify({
      cache_key: payload.cacheKey,
      text_hash: payload.textHash,
      cleaned_text: payload.speechText,
      voice_name: payload.voiceName,
      voice_gender: payload.voiceGender,
      speaking_rate: payload.speakingRate,
      pitch: 0,
      volume_gain_db: 0,
      cache_version: payload.cacheVersion,
      provider_key: payload.providerKey,
      char_count: payload.charCount,
      audio_base64: payload.audioBase64,
      audio_encoding: "MP3",
      created_at: new Date().toISOString(),
      last_accessed_at: new Date().toISOString(),
      hit_count: 0
    }),
    cache: "no-store"
  }).catch(error => {
    console.error("Google Chirp 3 HD cache save failed", {
      message: error instanceof Error ? error.message : "unknown"
    });
  });
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

const getClientIp = (request: NextRequest) => {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
};

const consumeRateLimit = (request: NextRequest, isPreview: boolean) => {
  const now = Date.now();
  const key = `${getClientIp(request)}|${isPreview ? "preview" : "regular"}`;
  const limit = isPreview ? PREVIEW_REQUESTS_PER_WINDOW : REGULAR_REQUESTS_PER_WINDOW;
  const current = rateBuckets.get(key);

  if (!current || now - current.windowStartedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { count: 1, windowStartedAt: now });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.windowStartedAt)) / 1000))
    };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, retryAfterSeconds: 0 };
};

const synthesizeChirpAudio = async (
  accessToken: string,
  speechText: string,
  profile: VoiceProfile,
  speakingRate: number
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_TTS_TIMEOUT_MS);

  try {
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { text: speechText },
        voice: {
          languageCode: profile.languageCode,
          name: profile.name,
          ssmlGender: profile.ssmlGender
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate
        }
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = await response.json().catch(() => null);
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
};

export async function GET(request: NextRequest) {
  try {
    await requireActiveUser(request);
    const settings = await getGlobalVoiceSettings();
    const usageState = await getUsageState();

    return NextResponse.json({
      ok: true,
      route: "/api/voice",
      engine: "google-cloud-text-to-speech",
      voiceFamily: "cmn-CN-Chirp3-HD",
      voices: {
        zephyr: VOICE_PROFILE_MAP.zephyr.name,
        iapetus: VOICE_PROFILE_MAP.iapetus.name
      },
      capabilities: {
        speakingRateApplied: true,
        pitchApplied: false,
        volumeGainApplied: false,
        punctuationPreserved: true,
        sharedAudioCache: true,
        previewCache: true,
        geminiTtsDisabled: true
      },
      currentGlobalVoiceSettings: settings,
      hasGoogleTtsCredentials: hasProviderCredentials("primary"),
      hasBackupGoogleTtsCredentials: hasProviderCredentials("backup"),
      usageCounterHealthy: usageState.healthy,
      usageCounterReason: usageState.reason,
      primaryCharLimit: getPrimaryLimit(),
      backupCharLimit: getBackupLimit(),
      monthlyCharLimit: usageState.snapshot.total.limitChars,
      usage: usageState.snapshot
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireActiveUser(request);
    const body = await request.json().catch(() => ({}));
    const speechText = normalizeSpeechText(body.text);
    const isPreview = body.preview === true;
    const serviceType = normalizeInput(body.serviceType || body.currentService || "");

    if (!speechText) {
      return NextResponse.json(
        { error: "缺少要產生語音的文字。", fallbackToBrowser: false },
        { status: 400 }
      );
    }

    const charCount = getTextCharCount(speechText);
    if (charCount > MAX_SPEECH_CHARS) {
      return NextResponse.json(
        {
          error: `語音文字過長，請縮短到 ${MAX_SPEECH_CHARS} 字以內。`,
          fallbackToBrowser: false,
          charCount
        },
        { status: 400 }
      );
    }

    const rateState = consumeRateLimit(request, isPreview);
    if (!rateState.allowed) {
      return NextResponse.json(
        {
          error: "語音請求過於頻繁，請稍後再試。",
          fallbackToBrowser: false,
          reason: "rate_limited",
          retryAfterSeconds: rateState.retryAfterSeconds
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateState.retryAfterSeconds) }
        }
      );
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
    const voiceProfile = resolveVoiceProfile(body.voiceProfile, globalSettings, isPreview);
    const profile = VOICE_PROFILE_MAP[voiceProfile];
    const previewTuning = isPreview && body.voiceTuning ? body.voiceTuning : null;
    const speakingRate = previewTuning
      ? clampNumber(previewTuning.speakingRate, profile.speakingRate, 0.8, 1.1)
      : clampNumber(globalSettings.speaking_rate, profile.speakingRate, 0.8, 1.1);

    const cacheVersion = `${isPreview ? "preview" : "regular"}|chirp3-v3|${
      globalSettings.cache_version || "v1"
    }`;
    const cacheKey = createSharedAudioCacheKey(speechText, profile, speakingRate, cacheVersion);
    const textHash = createHash("sha256").update(speechText).digest("hex");

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
          "X-Voice-Name": profile.name,
          "X-Voice-Language": profile.languageCode,
          "X-Voice-Speaking-Rate": String(speakingRate),
          "X-Voice-Punctuation": "preserved",
          "X-Voice-Cache": "shared-hit",
          "X-TTS-Chars": "0",
          "X-TTS-Cleaned-Chars": String(charCount),
          "X-RateLimit-Remaining": String(rateState.remaining)
        }
      });
    }

    const usageState = await getUsageState();
    if (!usageState.healthy) {
      return NextResponse.json(
        {
          error: "Google Cloud TTS 用量計數暫時無法確認，為避免超額已停止產生語音。",
          fallbackToBrowser: false,
          reason: usageState.reason
        },
        { status: 503 }
      );
    }

    const providerKey = selectProvider(usageState.snapshot, charCount);
    if (!providerKey) {
      return NextResponse.json(
        {
          error: "Google Cloud Chirp 3 HD 本月可用字元已不足。",
          fallbackToBrowser: false,
          reason: "monthly_limit_reached",
          usedChars: usageState.snapshot.total.usedChars,
          remainingChars: usageState.snapshot.total.remainingChars
        },
        { status: 429 }
      );
    }

    const accessToken = await getGoogleAccessToken(providerKey);
    let synthesisResult: Awaited<ReturnType<typeof synthesizeChirpAudio>>;

    try {
      synthesisResult = await synthesizeChirpAudio(accessToken, speechText, profile, speakingRate);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      console.error("Google Chirp 3 HD TTS request failed", {
        isTimeout,
        voiceName: profile.name,
        message: error instanceof Error ? error.message : "unknown"
      });
      return NextResponse.json(
        {
          error: isTimeout
            ? "Google Cloud Chirp 3 HD 回應逾時，請稍後再試。"
            : "Google Cloud Chirp 3 HD 連線失敗，請稍後再試。",
          fallbackToBrowser: false,
          reason: isTimeout ? "upstream_timeout" : "upstream_network_error"
        },
        { status: 504 }
      );
    }

    const { response, data } = synthesisResult;
    if (!response.ok || !data?.audioContent) {
      console.error("Google Chirp 3 HD TTS failed", {
        upstreamStatus: response.status,
        voiceName: profile.name,
        error: data?.error || data
      });
      return NextResponse.json(
        {
          error: data?.error?.message || "Google Cloud Chirp 3 HD 產生語音失敗。",
          fallbackToBrowser: false,
          reason: "upstream_error",
          upstreamStatus: response.status,
          voiceName: profile.name
        },
        { status: 502 }
      );
    }

    const audioBase64 = String(data.audioContent);
    const counterResult = await commitMonthlyCharacters(charCount);

    if (!counterResult.committed) {
      console.error("Google Chirp 3 HD usage counter commit failed", {
        reason: counterResult.reason,
        providerUsed: providerKey,
        charCount
      });
    }

    await saveCachedAudioBase64({
      cacheKey,
      textHash,
      speechText,
      voiceName: profile.name,
      voiceGender: profile.ssmlGender,
      speakingRate,
      cacheVersion,
      providerKey,
      charCount,
      audioBase64
    });

    const audioBuffer = Buffer.from(audioBase64, "base64");
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile,
        "X-Voice-Engine": "google-cloud-chirp3-hd",
        "X-Voice-Family": "cmn-CN-Chirp3-HD",
        "X-Voice-Name": profile.name,
        "X-Voice-Language": profile.languageCode,
        "X-Voice-Speaking-Rate": String(speakingRate),
        "X-Voice-Punctuation": "preserved",
        "X-Voice-Pitch-Applied": "false",
        "X-Voice-Volume-Applied": "false",
        "X-Voice-Cache": "shared-miss",
        "X-Voice-Provider": providerKey,
        "X-TTS-Counter-Status": counterResult.committed ? "committed" : "warning",
        "X-TTS-Chars": String(charCount),
        "X-TTS-Remaining-Chars": String(
          counterResult.remainingChars ?? Math.max(0, usageState.snapshot.total.remainingChars - charCount)
        ),
        "X-RateLimit-Remaining": String(rateState.remaining)
      }
    });
  } catch (error: unknown) {
    const authError = getAuthErrorResponse(error);
    if (authError.status === 401 || authError.status === 403) {
      return NextResponse.json({ error: authError.message }, { status: authError.status });
    }
    const message = error instanceof Error ? error.message : "Google Cloud Chirp 3 HD 產生語音失敗。";
    console.error("Google Chirp 3 HD TTS unhandled error", { message });
    return NextResponse.json(
      { error: message, fallbackToBrowser: false, reason: "internal_error" },
      { status: 500 }
    );
  }
}
