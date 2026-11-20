import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_RECOVERY_COMPLETED_EVENT,
  ACCOUNT_RECOVERY_REQUESTED_EVENT,
  ACCOUNT_RECOVERY_SUBJECT_TYPE,
  derivePendingAccountRecoveries,
  isValidRecoveryName,
  normalizeRecoveryName,
} from "@/lib/auth/password-reset";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_MESSAGE =
  "申請已送出。管理員確認本人後，系統會將原服事帳號與新的臨時密碼寄到你登記的 Email。";
const REQUEST_WINDOW_MINUTES = 10;
const MAX_RECENT_REQUESTS = 20;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedName = normalizeRecoveryName(body.displayName);

    if (!isValidRecoveryName(requestedName)) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const supabase = getSupabaseAdminClient();
    const recentCutoff = new Date(
      Date.now() - REQUEST_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const { count: recentCount, error: countError } = await supabase
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("subject_type", ACCOUNT_RECOVERY_SUBJECT_TYPE)
      .eq("event_type", ACCOUNT_RECOVERY_REQUESTED_EVENT)
      .gte("occurred_at", recentCutoff);
    if (countError) throw countError;

    if ((recentCount ?? 0) >= MAX_RECENT_REQUESTS) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const { data: auditRows, error: auditError } = await supabase
      .from("activity_logs")
      .select("id,event_type,occurred_at,metadata")
      .eq("subject_type", ACCOUNT_RECOVERY_SUBJECT_TYPE)
      .in("event_type", [
        ACCOUNT_RECOVERY_REQUESTED_EVENT,
        ACCOUNT_RECOVERY_COMPLETED_EVENT,
      ])
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (auditError) throw auditError;

    const alreadyPending = derivePendingAccountRecoveries(auditRows ?? [])
      .some((item) => normalizeRecoveryName(item.requestedName) === requestedName);

    if (!alreadyPending) {
      const { error: insertError } = await supabase.from("activity_logs").insert({
        actor_user_id: null,
        service_id: null,
        event_type: ACCOUNT_RECOVERY_REQUESTED_EVENT,
        subject_type: ACCOUNT_RECOVERY_SUBJECT_TYPE,
        subject_id: null,
        metadata: {
          requested_name: requestedName,
          source: "login_page",
        },
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch {
    return NextResponse.json(
      { error: "目前無法送出帳號／密碼協助申請，請稍後再試或直接聯絡管理員。" },
      { status: 500 }
    );
  }
}
