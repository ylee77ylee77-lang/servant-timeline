import { NextRequest, NextResponse } from "next/server";
import { isValidAccountCode, normalizeAccountCode } from "@/lib/auth/account-code";
import {
  PASSWORD_RESET_COMPLETED_EVENT,
  PASSWORD_RESET_REQUESTED_EVENT,
} from "@/lib/auth/password-reset";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "如果帳號存在且可使用，管理員會在帳號管理頁看到密碼重設申請。";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountCode = normalizeAccountCode(body.accountCode);

    if (!isValidAccountCode(accountCode)) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const supabase = getSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,is_active")
      .eq("account_code", accountCode)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.is_active) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }

    const { data: latestRows, error: latestError } = await supabase
      .from("activity_logs")
      .select("id,event_type,occurred_at")
      .eq("subject_type", "user")
      .eq("subject_id", profile.id)
      .in("event_type", [
        PASSWORD_RESET_REQUESTED_EVENT,
        PASSWORD_RESET_COMPLETED_EVENT,
      ])
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (latestError) throw latestError;

    const latest = latestRows?.[0];
    if (latest?.event_type !== PASSWORD_RESET_REQUESTED_EVENT) {
      const { error: insertError } = await supabase.from("activity_logs").insert({
        actor_user_id: null,
        service_id: null,
        event_type: PASSWORD_RESET_REQUESTED_EVENT,
        subject_type: "user",
        subject_id: profile.id,
        metadata: { source: "login_page" },
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  } catch {
    return NextResponse.json(
      { error: "目前無法送出密碼重設申請，請稍後再試或直接聯絡管理員。" },
      { status: 500 }
    );
  }
}
