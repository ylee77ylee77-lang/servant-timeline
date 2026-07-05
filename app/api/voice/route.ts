import { NextRequest, NextResponse } from "next/server";
import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MONTHLY_LIMIT = 4_000_000;

const VOICE_PROFILE_MAP: Record<string, { name: string; ssmlGender: "FEMALE" | "MALE"; speakingRate: number; pitch: number }> = {
  young_female: {
    name: "cmn-TW-Wavenet-A",
    ssmlGender: "FEMALE",
    speakingRate: 0.92,
    pitch: 1.5
  },
  mature_male: {
    name: "cmn-TW-Wavenet-B",
    ssmlGender: "MALE",
    speakingRate: 0.9,
    pitch: -3.5
  }
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();

const getMonthKey = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const getTextCharCount = (text: string) => Array.from(text).length;

const base64UrlEncode = (value: Buffer | string) => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const getServiceAccount = () => {
  const rawJson = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;

  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key || "").replace(/\\n/g, "\n")
    };
  }

  return {
    clientEmail: process.env.GOOGLE_TTS_CLIENT_EMAIL,
    privateKey: String(process.env.GOOGLE_TTS_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  };
};

const getGoogleAccessToken = async () => {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const { clientEmail, privateKey } = getServiceAccount();

  if (!clientEmail || !privateKey) {
    throw new Error("缺少 Google Cloud TTS service account。請設定 GOOGLE_TTS_SERVICE_ACCOUNT_JSON，或 GOOGLE_TTS_CLIENT_EMAIL / GOOGLE_TTS_PRIVATE_KEY。");
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

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000
  };

  return cachedAccessToken.token;
};

const reserveMonthlyCharacters = async (chars: number) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY;
  const limit = Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || DEFAULT_MONTHLY_LIMIT);
  const month = getMonthKey();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      allowed: false,
      usedChars: 0,
      remainingChars: 0,
      reason: "missing_usage_counter"
    };
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/reserve_tts_chars`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "Authorization": `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_month: month,
      p_chars: chars,
      p_limit: limit
    })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      allowed: false,
      usedChars: 0,
      remainingChars: 0,
      reason: "counter_error",
      detail: data
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    allowed: row?.allowed === true,
    usedChars: Number(row?.used_chars || 0),
    remainingChars: Number(row?.remaining_chars || 0),
    reason: row?.allowed === true ? "" : "monthly_limit_reached"
  };
};

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/voice",
    engine: "google-cloud-text-to-speech",
    hasGoogleTtsCredentials: Boolean(process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_TTS_CLIENT_EMAIL && process.env.GOOGLE_TTS_PRIVATE_KEY)),
    hasUsageCounter: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL) && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY)),
    monthlyCharLimit: Number(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT || DEFAULT_MONTHLY_LIMIT)
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = normalizeInput(body.text);
    const voiceProfile = normalizeInput(body.voiceProfile) || "young_female";

    if (!text) {
      return NextResponse.json({ error: "缺少要產生語音的文字。", fallbackToBrowser: true }, { status: 400 });
    }

    if (text.length > 600) {
      return NextResponse.json({ error: "語音文字過長，請縮短到 600 字以內。", fallbackToBrowser: true }, { status: 400 });
    }

    const charCount = getTextCharCount(text);
    const reservation = await reserveMonthlyCharacters(charCount);

    if (!reservation.allowed) {
      return NextResponse.json(
        {
          error: reservation.reason === "monthly_limit_reached"
            ? "Google Cloud TTS 本月 400 萬字元上限已達，已退回瀏覽器語音。"
            : "Google Cloud TTS 用量控管尚未設定完成，已退回瀏覽器語音。",
          fallbackToBrowser: true,
          reason: reservation.reason,
          usedChars: reservation.usedChars,
          remainingChars: reservation.remainingChars
        },
        { status: 429 }
      );
    }

    const profile = VOICE_PROFILE_MAP[voiceProfile] || VOICE_PROFILE_MAP.young_female;
    const accessToken = await getGoogleAccessToken();

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
          name: profile.name,
          ssmlGender: profile.ssmlGender
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: profile.speakingRate,
          pitch: profile.pitch,
          volumeGainDb: 0
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

    const audioBuffer = Buffer.from(data.audioContent, "base64");

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Voice-Profile": voiceProfile,
        "X-Voice-Engine": "google-cloud-tts",
        "X-TTS-Chars": String(charCount),
        "X-TTS-Remaining-Chars": String(reservation.remainingChars)
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Google Cloud TTS 產生語音失敗。";
    return NextResponse.json({ error: message, fallbackToBrowser: true }, { status: 500 });
  }
}
