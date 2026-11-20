import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ACCOUNT_RECOVERY_COMPLETED_EVENT,
  ACCOUNT_RECOVERY_REQUESTED_EVENT,
  ACCOUNT_RECOVERY_SUBJECT_TYPE,
  derivePendingAccountRecoveries,
  MUST_CHANGE_PASSWORD_APP_METADATA_KEY,
  maskContactEmail,
  withPasswordChangeRequired,
} from "@/lib/auth/password-reset";
import { sendAccountRecoveryEmail, ACCOUNT_RECOVERY_EMAIL_DAILY_LIMIT } from "@/lib/email/gmail";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPORARY_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function createTemporaryPassword() {
  const bytes = randomBytes(10);
  return Array.from(bytes, (byte) =>
    TEMPORARY_PASSWORD_CHARS[byte % TEMPORARY_PASSWORD_CHARS.length]
  ).join("");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = getSupabaseAdminClient();

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

    const requests = derivePendingAccountRecoveries(auditRows ?? []).map((item) => ({
      requestLogId: String(item.requestLogId),
      requestedName: item.requestedName,
      requestedAt: item.requestedAt,
    }));

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
    const requestLogId = String(body.requestLogId ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!/^\d+$/.test(requestLogId)) {
      return NextResponse.json({ error: "申請識別資料無效。" }, { status: 400 });
    }
    if (!isUuid(userId)) {
      return NextResponse.json({ error: "服事帳號識別資料無效。" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
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

    const pendingRequest = derivePendingAccountRecoveries(auditRows ?? [])
      .find((item) => String(item.requestLogId) === requestLogId);
    if (!pendingRequest) {
      return NextResponse.json(
        { error: "這份申請已處理或已不存在，請重新整理。" },
        { status: 409 }
      );
    }

    const [{ data: profile, error: profileError }, { data: contact, error: contactError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,account_code,display_name,is_active")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("account_recovery_contacts")
          .select("contact_email")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
    if (profileError) throw profileError;
    if (contactError) throw contactError;
    if (!profile) {
      return NextResponse.json({ error: "找不到這個服事帳號。" }, { status: 404 });
    }
    if (!profile.is_active) {
      return NextResponse.json(
        { error: "此帳號尚未啟用，請先處理帳號狀態。" },
        { status: 409 }
      );
    }
    if (!contact?.contact_email) {
      return NextResponse.json(
        { error: "此帳號尚未設定救援 Email，請先在帳號管理中補上 Email。" },
        { status: 409 }
      );
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: sentCount, error: sentCountError } = await supabase
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("subject_type", ACCOUNT_RECOVERY_SUBJECT_TYPE)
      .eq("event_type", ACCOUNT_RECOVERY_COMPLETED_EVENT)
      .gte("occurred_at", since);
    if (sentCountError) throw sentCountError;
    if ((sentCount ?? 0) >= ACCOUNT_RECOVERY_EMAIL_DAILY_LIMIT) {
      return NextResponse.json(
        { error: "今日帳號救援寄信已達免費安全上限，請稍後再處理。" },
        { status: 429 }
      );
    }

    const { data: authUserData, error: authUserError } =
      await supabase.auth.admin.getUserById(profile.id);
    if (authUserError || !authUserData.user) {
      return NextResponse.json(
        { error: "無法讀取帳號狀態，請稍後再試。" },
        { status: 500 }
      );
    }

    const temporaryPassword = createTemporaryPassword();
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      {
        password: temporaryPassword,
        app_metadata: withPasswordChangeRequired(
          authUserData.user.app_metadata,
          true
        ),
      }
    );
    if (updateError) {
      return NextResponse.json(
        { error: "重設登入資料失敗，請稍後再試。" },
        { status: 500 }
      );
    }

    let messageId = "";
    try {
      const sent = await sendAccountRecoveryEmail({
        toEmail: String(contact.contact_email),
        accountCode: String(profile.account_code || ""),
        temporaryPassword,
      });
      messageId = sent.messageId;
    } catch {
      return NextResponse.json(
        {
          error: "臨時密碼已重設，但 Email 寄送失敗。申請仍保留，請確認 Gmail App Password 設定後重新處理；再次處理會產生新的臨時密碼。",
        },
        { status: 502 }
      );
    }

    const { error: logError } = await supabase.from("activity_logs").insert({
      actor_user_id: admin.userId,
      service_id: null,
      event_type: ACCOUNT_RECOVERY_COMPLETED_EVENT,
      subject_type: ACCOUNT_RECOVERY_SUBJECT_TYPE,
      subject_id: profile.id,
      metadata: {
        request_log_id: requestLogId,
        delivery: "gmail_smtp",
        recipient: maskContactEmail(String(contact.contact_email)),
        provider_message_id: messageId,
        source: "admin_users_page",
        [MUST_CHANGE_PASSWORD_APP_METADATA_KEY]: true,
      },
    });
    if (logError) throw logError;

    return NextResponse.json({
      ok: true,
      delivery: {
        displayName: String(profile.display_name || "同工"),
        accountCode: String(profile.account_code || ""),
        emailMasked: maskContactEmail(String(contact.contact_email)),
      },
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
