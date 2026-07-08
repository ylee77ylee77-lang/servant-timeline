import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIMARY_DEFAULT_LIMIT = 4_000_000;
const BACKUP_DEFAULT_LIMIT = 4_000_000;

const DEFAULT_GLOBAL_VOICE_SETTINGS = {
  voice_gender: "female",
  speaking_rate: 0.92,
  pitch: 1.5,
  volume_gain_db: 0,
  cache_version: "v1",
  updated_by: "",
  updated_at: ""
};

const normalizeInput = (value: unknown) => String(value || "").replace(/\s+/g, " ").trim();
const normalizeName = (value: unknown) => normalizeInput(value).replace(/\s/g, "");

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

const parseServiceAccountJson = (rawJson: string | undefined) => {
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson);
    return {
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key || "").replace(/\\n/g, "\n")
    };
  } catch {
    return null;
  }
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

const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || PRIMARY_DEFAULT_LIMIT);
const getBackupLimit = () => Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || BACKUP_DEFAULT_LIMIT);

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
    month: pick("month")
  };
};

const getMonthKey = () => {
  const taipei = getTaipeiParts();
  return `${taipei.year}-${String(taipei.month).padStart(2, "0")}`;
};

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

const normalizeSettingsRow = (row: any) => ({
  voice_gender: row?.voice_gender === "male" ? "male" : "female",
  speaking_rate: clampNumber(row?.speaking_rate, DEFAULT_GLOBAL_VOICE_SETTINGS.speaking_rate, 0.8, 1.1),
  pitch: clampNumber(row?.pitch, row?.voice_gender === "male" ? -0.5 : DEFAULT_GLOBAL_VOICE_SETTINGS.pitch, -2, 8),
  volume_gain_db: clampNumber(row?.volume_gain_db, DEFAULT_GLOBAL_VOICE_SETTINGS.volume_gain_db, -6, 3),
  cache_version: String(row?.cache_version || DEFAULT_GLOBAL_VOICE_SETTINGS.cache_version),
  updated_by: String(row?.updated_by || ""),
  updated_at: String(row?.updated_at || "")
});

const getGlobalVoiceSettings = async () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceRoleKey) return DEFAULT_GLOBAL_VOICE_SETTINGS;

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
  return normalizeSettingsRow(row);
};

const buildDiagnostics = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  return {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasGoogleTtsCredentials: hasProviderCredentials("primary"),
    hasBackupGoogleTtsCredentials: hasProviderCredentials("backup"),
    primaryCharLimit: getPrimaryLimit(),
    backupCharLimit: hasProviderCredentials("backup") ? getBackupLimit() : 0
  };
};

export async function GET() {
  const settings = await getGlobalVoiceSettings();
  const usage = await getUsageSnapshot();
  const diagnostics = buildDiagnostics();

  return NextResponse.json({
    ok: true,
    route: "/api/voice-settings",
    settings,
    usage,
    monthlyCharLimit: usage.total.limitChars,
    ...diagnostics,
    diagnostics
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminName = normalizeName(body.adminName || "徐東立");
    const allowedAdminNames = new Set(["徐東立", "東立徐", "東立"]);

    if (!allowedAdminNames.has(adminName)) {
      return NextResponse.json({
        error: "只有徐東立可以調整全站語音設定。",
        diagnostics: buildDiagnostics()
      }, { status: 403 });
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({
        error: "缺少 Supabase URL 或 service_role key，無法儲存全站語音設定。",
        diagnostics: buildDiagnostics()
      }, { status: 500 });
    }

    const incomingSettings = body.settings || {};
    const voiceGender = incomingSettings.voice_gender === "male" ? "male" : "female";
    const nextSettings = {
      id: "global",
      voice_gender: voiceGender,
      speaking_rate: clampNumber(incomingSettings.speaking_rate, 0.92, 0.8, 1.1),
      pitch: clampNumber(incomingSettings.pitch, voiceGender === "male" ? -0.5 : 1.5, -2, 8),
      volume_gain_db: clampNumber(incomingSettings.volume_gain_db, 0, -6, 3),
      cache_version: `v${Date.now()}`,
      updated_by: "徐東立",
      updated_at: new Date().toISOString()
    };

    const response = await fetch(`${supabaseUrl}/rest/v1/app_voice_settings?on_conflict=id`, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(nextSettings)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({
        error: data?.message || data?.error || "儲存全站語音設定失敗。",
        detail: data,
        diagnostics: buildDiagnostics()
      }, { status: response.status || 500 });
    }

    const savedRow = Array.isArray(data) ? data[0] : data;
    const settings = normalizeSettingsRow(savedRow || nextSettings);
    const usage = await getUsageSnapshot();
    const diagnostics = buildDiagnostics();

    return NextResponse.json({
      ok: true,
      route: "/api/voice-settings",
      settings,
      usage,
      monthlyCharLimit: usage.total.limitChars,
      ...diagnostics,
      diagnostics
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "儲存全站語音設定失敗。";
    return NextResponse.json({ error: message, diagnostics: buildDiagnostics() }, { status: 500 });
  }
}
