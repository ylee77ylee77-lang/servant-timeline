import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireActiveUser, requireAdmin } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER_FREE_TIER_LIMIT = 1_000_000;

const DEFAULT_GLOBAL_VOICE_SETTINGS = {
  voice_gender: "female" as "female" | "male",
  voice_profile: "zephyr" as "zephyr" | "iapetus",
  speaking_rate: 0.92,
  pitch: 0,
  volume_gain_db: 0,
  cache_version: "chirp3-v3",
  updated_by: "",
  updated_at: ""
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

const parseLimit = (value: string | undefined, fallback: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.min(PROVIDER_FREE_TIER_LIMIT, Math.floor(numeric));
};

const getSupabaseConfig = () => {
  const supabaseUrl = normalizeSupabaseUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.TTS_USAGE_SUPABASE_URL
  );
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TTS_USAGE_SUPABASE_SERVICE_ROLE_KEY;

  return { supabaseUrl, serviceRoleKey };
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

const getServiceAccount = (providerKey: "primary" | "backup") => {
  const isBackup = providerKey === "backup";
  const rawJson = isBackup
    ? process.env.GOOGLE_TTS_BACKUP_SERVICE_ACCOUNT_JSON
    : process.env.GOOGLE_TTS_PRIMARY_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;

  const parsed = parseServiceAccountJson(rawJson);
  if (parsed) return parsed;

  return isBackup
    ? {
        clientEmail: String(process.env.GOOGLE_TTS_BACKUP_CLIENT_EMAIL || ""),
        privateKey: String(process.env.GOOGLE_TTS_BACKUP_PRIVATE_KEY || "").replace(/\\n/g, "\n")
      }
    : {
        clientEmail: String(process.env.GOOGLE_TTS_CLIENT_EMAIL || ""),
        privateKey: String(process.env.GOOGLE_TTS_PRIVATE_KEY || "").replace(/\\n/g, "\n")
      };
};

const hasProviderCredentials = (providerKey: "primary" | "backup") => {
  const account = getServiceAccount(providerKey);
  return Boolean(account.clientEmail && account.privateKey);
};

const getPrimaryLimit = () =>
  hasProviderCredentials("primary")
    ? parseLimit(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT, PROVIDER_FREE_TIER_LIMIT)
    : 0;

const getBackupLimit = () =>
  hasProviderCredentials("backup")
    ? parseLimit(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT, PROVIDER_FREE_TIER_LIMIT)
    : 0;

const getMonthKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find(part => part.type === "year")?.value || "0000";
  const month = parts.find(part => part.type === "month")?.value || "00";
  return `${year}-${month}`;
};

const getDefaultUsageSnapshot = () => {
  const primaryLimit = getPrimaryLimit();
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

const fetchUsage = async () => {
  const snapshot = getDefaultUsageSnapshot();
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return snapshot;

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

  if (!response.ok) return snapshot;

  const rows: unknown = await response.json().catch(() => []);
  const primaryRow = Array.isArray(rows)
    ? rows.find((row) => isUsageRow(row) && row.provider_key === "primary")
    : null;
  const backupRow = Array.isArray(rows)
    ? rows.find((row) => isUsageRow(row) && row.provider_key === "backup")
    : null;

  const primaryUsed = Math.max(0, Number(primaryRow?.used_chars || 0));
  const backupUsed = Math.max(0, Number(backupRow?.used_chars || 0));
  const totalUsed = primaryUsed + backupUsed;
  const totalLimit = snapshot.total.limitChars;

  return {
    month: snapshot.month,
    primary: {
      usedChars: primaryUsed,
      limitChars: snapshot.primary.limitChars,
      remainingChars: Math.max(0, snapshot.primary.limitChars - primaryUsed)
    },
    backup: {
      usedChars: backupUsed,
      limitChars: snapshot.backup.limitChars,
      remainingChars: Math.max(0, snapshot.backup.limitChars - backupUsed)
    },
    total: {
      usedChars: totalUsed,
      limitChars: totalLimit,
      remainingChars: Math.max(0, totalLimit - totalUsed),
      usageRate: totalLimit > 0 ? Math.round((totalUsed * 1000) / totalLimit) / 10 : 0
    }
  };
};

const isUsageRow = (value: unknown): value is { provider_key?: unknown; used_chars?: unknown } =>
  typeof value === "object" && value !== null;

const normalizeSettingsRow = (value: unknown) => {
  const row = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
  const voiceGender: "female" | "male" = row?.voice_gender === "male" ? "male" : "female";

  return {
    voice_gender: voiceGender,
    voice_profile: voiceGender === "male" ? "iapetus" : "zephyr",
    speaking_rate: clampNumber(row?.speaking_rate, 0.92, 0.8, 1.1),
    pitch: clampNumber(row?.pitch, 0, -2, 8),
    volume_gain_db: clampNumber(row?.volume_gain_db, 0, -6, 3),
    cache_version: String(row?.cache_version || "chirp3-v3"),
    updated_by: String(row?.updated_by || ""),
    updated_at: String(row?.updated_at || "")
  };
};

const fetchSettings = async () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return DEFAULT_GLOBAL_VOICE_SETTINGS;

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
  return row ? normalizeSettingsRow(row) : DEFAULT_GLOBAL_VOICE_SETTINGS;
};

const diagnostics = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  return {
    engine: "google-cloud-text-to-speech",
    voiceFamily: "cmn-CN-Chirp3-HD",
    speakingRateApplied: true,
    pitchApplied: false,
    volumeGainApplied: false,
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasGoogleTtsCredentials: hasProviderCredentials("primary"),
    hasBackupGoogleTtsCredentials: hasProviderCredentials("backup"),
    primaryCharLimit: getPrimaryLimit(),
    backupCharLimit: getBackupLimit()
  };
};

export async function GET(request: NextRequest) {
  try {
    await requireActiveUser(request);
    const settings = await fetchSettings();
    const usage = await fetchUsage();

    return NextResponse.json({
      ok: true,
      route: "/api/voice-settings",
      settings,
      usage,
      monthlyCharLimit: usage.total.limitChars,
      diagnostics: diagnostics()
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "缺少 Supabase URL 或 service role 設定。" },
        { status: 500 }
      );
    }

    const incoming = body.settings || {};
    const voiceGender: "female" | "male" = incoming.voice_gender === "male" ? "male" : "female";
    const payload = {
      id: "global",
      voice_gender: voiceGender,
      speaking_rate: clampNumber(incoming.speaking_rate, 0.92, 0.8, 1.1),
      pitch: clampNumber(incoming.pitch, 0, -2, 8),
      volume_gain_db: clampNumber(incoming.volume_gain_db, 0, -6, 3),
      cache_version: `chirp3-${Date.now()}`,
      updated_by: admin.displayName,
      updated_at: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/app_voice_settings?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || "儲存全站語音設定失敗。" },
        { status: response.status || 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    const settings = normalizeSettingsRow(row || payload);
    const usage = await fetchUsage();

    return NextResponse.json({
      ok: true,
      route: "/api/voice-settings",
      settings,
      usage,
      monthlyCharLimit: usage.total.limitChars,
      diagnostics: diagnostics()
    });
  } catch (error: unknown) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
