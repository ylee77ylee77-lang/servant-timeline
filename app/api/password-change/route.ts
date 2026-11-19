import { NextRequest, NextResponse } from "next/server";
import {
  isValidResetPassword,
  PASSWORD_CHANGED_BY_USER_EVENT,
  requiresPasswordChange,
  withPasswordChangeRequired,
} from "@/lib/auth/password-reset";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const body = await request.json().catch(() => ({}));
    const password = String(body.password ?? "");

    if (!isValidResetPassword(password)) {
      return NextResponse.json(
        { error: "新密碼需為至少 8 位、最多 72 位字元。" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(
      user.userId
    );

    if (authUserError || !authUserData.user) {
      return NextResponse.json(
        { error: "無法讀取帳號狀態，請稍後再試。" },
        { status: 500 }
      );
    }

    if (!requiresPasswordChange(authUserData.user.app_metadata)) {
      return NextResponse.json(
        { error: "目前不需要更新臨時密碼。" },
        { status: 409 }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.userId,
      {
        password,
        app_metadata: withPasswordChangeRequired(
          authUserData.user.app_metadata,
          false
        ),
      }
    );

    if (updateError) {
      return NextResponse.json(
        { error: "更新密碼失敗，請稍後再試。" },
        { status: 500 }
      );
    }

    const { error: logError } = await supabase.from("activity_logs").insert({
      actor_user_id: user.userId,
      service_id: null,
      event_type: PASSWORD_CHANGED_BY_USER_EVENT,
      subject_type: "user",
      subject_id: user.userId,
      metadata: { source: "forced_password_change" },
    });
    if (logError) throw logError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
