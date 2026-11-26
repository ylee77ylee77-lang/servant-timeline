import { NextRequest, NextResponse } from "next/server";
import {
  accountCodeToInternalEmail,
  isValidAccountCode,
  normalizeAccountCode,
} from "@/lib/auth/account-code";
import { isValidContactEmail, normalizeContactEmail } from "@/lib/auth/password-reset";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { isRegistrationSameOrigin, readRegistrationSession, writeRegistrationCookie } from "@/lib/auth/registration-verification-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  if (!isRegistrationSameOrigin(request)) return NextResponse.json({ error: "請從註冊頁面操作。" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const accountCode = normalizeAccountCode(body.accountCode);
    const displayName = String(body.displayName ?? "").normalize("NFKC").trim();
    const contactEmail = normalizeContactEmail(body.contactEmail);
    const password = String(body.password ?? "");
    const avatarConfig = normalizeAvatarConfig(body.avatarConfig);

    if (!isValidAccountCode(accountCode)) {
      return NextResponse.json(
        { error: "服事帳號需為 3–32 字元，僅可使用英文小寫、數字、點、底線或連字號。" },
        { status: 400 }
      );
    }
    if (!displayName || displayName.length > 80) {
      return NextResponse.json({ error: "姓名需為 1–80 字元。" }, { status: 400 });
    }
    if (!isValidContactEmail(contactEmail)) {
      return NextResponse.json({ error: "請輸入有效的聯絡 Email。" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "密碼需為 8–72 字元。" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("account_code", accountCode)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existingProfile) {
      return NextResponse.json({ error: "這個服事帳號已被使用。" }, { status: 409 });
    }

    const sessionDigest = readRegistrationSession(request);
    if (!sessionDigest) {
      return NextResponse.json({ error: "請先完成電子郵件驗證。" }, { status: 403 });
    }
    // Single-use server-side claim binds the verified email and both identity fields.
    const { data: verifiedAt, error: claimError } = await supabase.rpc("registration_email_claim", {
      p_session: sessionDigest, p_display_name: displayName, p_account_code: accountCode, p_contact_email: contactEmail,
    });
    if (claimError) throw claimError;
    if (typeof verifiedAt !== "string" || !verifiedAt) {
      return NextResponse.json({ error: "請先完成電子郵件驗證或重新發送驗證信。" }, { status: 403 });
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: accountCodeToInternalEmail(accountCode),
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });

    if (createError || !created.user) {
      const duplicate = createError?.message?.toLowerCase().includes("already") ?? false;
      return NextResponse.json(
        { error: duplicate ? "這個服事帳號已被使用。" : "建立帳號失敗，請稍後再試。" },
        { status: duplicate ? 409 : 500 }
      );
    }

    createdUserId = created.user.id;

    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: createdUserId,
          account_code: accountCode,
          display_name: displayName,
          avatar_config: avatarConfig,
          is_active: false,
        },
        { onConflict: "id" }
      );
    if (profileError) throw profileError;

    const { error: contactError } = await supabase
      .from("account_recovery_contacts")
      .upsert({
        user_id: createdUserId,
        contact_email: contactEmail,
        email_verified_at: verifiedAt,
        email_verification_required: true,
        updated_at: new Date().toISOString(),
      });
    if (contactError) throw contactError;

    // The auth-user trigger creates a default volunteer role. Self-registered
    // trial accounts must remain unauthorized until an admin approves them.
    const { error: roleDeleteError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", createdUserId);
    if (roleDeleteError) throw roleDeleteError;

    return writeRegistrationCookie(NextResponse.json(
      {
        ok: true,
        message: "註冊完成，請等待管理員啟用帳號。",
        user: { accountCode, displayName },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    ), "");
  } catch (error) {
    if (createdUserId) {
      await getSupabaseAdminClient().auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    console.error("Self-registration failed", error);
    return NextResponse.json({ error: "建立帳號失敗，請稍後再試。" }, { status: 500 });
  }
}
