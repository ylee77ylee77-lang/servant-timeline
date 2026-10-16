import { NextRequest, NextResponse } from "next/server";
import { isValidAccountCode, normalizeAccountCode } from "@/lib/auth/account-code";
import {
  derivePendingPasswordResets,
  isValidResetPassword,
  PASSWORD_RESET_COMPLETED_EVENT,
  PASSWORD_RESET_REQUESTED_EVENT,
} from "@/lib/auth/password-reset";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = getSupabaseAdminClient();

    const { data: auditRows, error: auditError } = await supabase
      .from("activity_logs")
      .select("id,subject_id,event_type,occurred_at")
      .eq("subject_type", "user")
      .in("event_type", [
        PASSWORD_RESET_REQUESTED_EVENT,
        PASSWORD_RESET_COMPLETED_EVENT,
      ])
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (auditError) throw auditError;

    const pending = derivePendingPasswordResets(auditRows ?? []);
    if (!pending.length) {
      return NextResponse.json({ requests: [] });
    }

    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id,account_code,display_name,is_active")
      .in("id", pending.map((item) => item.subjectId));
    if (profileError) throw profileError;

    const profileById = new Map(
      (profiles ?? []).map((profile) => [String(profile.id), profile])
    );

    const requests = pending.flatMap((item) => {
      const profile = profileById.get(item.subjectId);
      if (!profile) return [];
      return [{
        userId: item.subjectId,
        accountCode: String(profile.account_code || ""),
        displayName: String(profile.display_name || "同工"),
        isActive: Boolean(profile.is_active),
        requestedAt: item.requestedAt,
      }];
    });

    return NextResponse.json({ requests });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const accountCode = normalizeAccountCode(body.accountCode);
    const password = String(body.password ?? "");

    if (!isValidAccountCode(accountCode)) {
      return NextResponse.json({ error: "服事帳號格式無效。" }, { status: 400 });
    }
    if (!isValidResetPassword(password)) {
      return NextResponse.json({ error: "新密碼需為 8–72 字元。" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,account_code,display_name,is_active")
      .eq("account_code", accountCode)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: "找不到這個服事帳號。" }, { status: 404 });
    }
    if (!profile.is_active) {
      return NextResponse.json({ error: "此帳號尚未啟用，請先處理帳號狀態。" }, { status: 409 });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      { password }
    );
    if (updateError) {
      return NextResponse.json(
        { error: "重設密碼失敗，請稍後再試。" },
        { status: 500 }
      );
    }

    const { error: logError } = await supabase.from("activity_logs").insert({
      actor_user_id: admin.userId,
      service_id: null,
      event_type: PASSWORD_RESET_COMPLETED_EVENT,
      subject_type: "user",
      subject_id: profile.id,
      metadata: { source: "admin_users_page" },
    });
    if (logError) throw logError;

    return NextResponse.json({
      ok: true,
      user: {
        accountCode: String(profile.account_code || accountCode),
        displayName: String(profile.display_name || "同工"),
      },
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
