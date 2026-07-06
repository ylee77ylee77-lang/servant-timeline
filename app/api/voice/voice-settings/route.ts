import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GLOBAL_VOICE_SETTINGS = {
  voice_gender: "female",
  speaking_rate: 0.92,
  pitch: 1.5,
  volume_gain_db: 0,
  cache_version: "v1",
  updated_by: "",
  updated_at: ""
};

const normalizeSupabaseUrl = (value: string | undefined) => {
  const raw = String(value || "").trim();
  const markdownMatch = raw.match(/^\[(https?:\/\/[^\]]+)\]\(https?:\/\/[^\)]+\)$/);
  return (markdownMatch ? markdownMatch[1] : raw).replace(/\/+$/g, "");
};

const normalizeName = (value: unknown) => String(value || "").replace(/\s/g, "").trim();

const isAllowedAdmin = (value: unknown) => {
  const name = normalizeName(value);
  return ["徐東立", "東立徐", "東立"].includes(name);
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

const getTaipeiMonthKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find(part => part.type === "year")?.value || "0000";
  const month = parts.find(part => part.type === "month")?.value || "00";
  return `${year}-${month}`;
};

const hasBackupCredentials = () => Boolean(process.env.GOOGLE_TTS_BACKUP_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_TTS_BACKUP_CLIENT_EMAIL && process.env.GOOGLE_TTS_BACKUP_PRIVATE_KEY));
const getPrimaryLimit = () => Number(process.env.GOOGLE_TTS_PRIMARY_CHAR_LIMIT || 4_000_000);
const getBackupLimit = () => hasBackupCredentials() ? Number(process.env.GOOGLE_TTS_BACKUP_CHAR_LIMIT || 4_000_000) : 0;

const getDefaultUsageSnapshot = () => {
  const primaryLimit = getPrimaryLimit();
  const backupLimit = getBackupLimit();
  const totalLimit = primaryLimit + backupLimit;

  return {
    month: getTaipeiMonthKey(),
    primary: { usedChars: 0, limitChars: primaryLimit, remainingChars: primaryLimit },
    backup: { usedChars: 0, limitChars: backupLimit, remainingChars: backupLimit },
    total: { usedChars: 0, limitChars: totalLimit, remainingChars: totalLimit, usageRate: 0 }
  };
};

const fetchSettings = async () => {
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

  return {
    voice_gender: row.voice_gender === "male" ? "male" : "female",
    speaking_rate: clampNumber(row.speaking_rate, 0.92, 0.8, 1.1),
    pitch: clampNumber(row.pitch, 1.5, -2, 8),
    volume_gain_db: clampNumber(row.volume_gain_db, 0, -6, 3),
    cache_version: String(row.cache_version || "v1"),
    updated_by: String(row.updated_by || ""),
    updated_at: String(row.updated_at || "")
  };
};

const fetchUsage = async () => {
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

export async function GET() {
  const settings = await fetchSettings();
  const usage = await fetchUsage();

  return NextResponse.json({
    ok: true,
    settings,
    usage,
    voiceFamily: "cmn-TW-Wavenet"
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const adminName = body.adminName;

    if (!isAllowedAdmin(adminName)) {
      return NextResponse.json({ error: "只有徐東立可以調整全站語音設定。" }, { status: 403 });
    }

    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "缺少 Supabase service role 設定。" }, { status: 500 });
    }

    const settings = body.settings || {};
    const previousSettings = await fetchSettings();
    const previousVersionNumber = Number(String(previousSettings.cache_version || "v1").replace(/^v/i, "")) || 1;
    const nextCacheVersion = `v${previousVersionNumber + 1}`;

    const payload = {
      id: "global",
      voice_gender: settings.voice_gender === "male" ? "male" : "female",
      speaking_rate: clampNumber(settings.speaking_rate, 0.92, 0.8, 1.1),
      pitch: clampNumber(settings.pitch, 1.5, -2, 8),
      volume_gain_db: clampNumber(settings.volume_gain_db, 0, -6, 3),
      cache_version: nextCacheVersion,
      updated_by: normalizeName(adminName),
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
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ error: "儲存語音設定失敗。", detail: data }, { status: response.status });
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      ok: true,
      settings: {
        voice_gender: row.voice_gender,
        speaking_rate: Number(row.speaking_rate),
        pitch: Number(row.pitch),
        volume_gain_db: Number(row.volume_gain_db),
        cache_version: String(row.cache_version || nextCacheVersion),
        updated_by: String(row.updated_by || ""),
        updated_at: String(row.updated_at || "")
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "儲存語音設定失敗。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

