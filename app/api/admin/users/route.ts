import { NextRequest, NextResponse } from "next/server";
import { accountCodeToInternalEmail, isValidAccountCode, normalizeAccountCode } from "@/lib/auth/account-code";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["volunteer", "coordinator", "admin"]);

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const accountCode = normalizeAccountCode(body.accountCode);
    const displayName = String(body.displayName ?? "").normalize("NFKC").trim();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "volunteer");

    if (!isValidAccountCode(accountCode)) {
      return NextResponse.json(
        { error: "服事帳號需為 3–32 字元，僅可使用英文小寫、數字、點、底線或連字號。" },
        { status: 400 }
      );
    }
    if (!displayName || displayName.length > 80) {
      return NextResponse.json({ error: "姓名需為 1–80 字元。" }, { status: 400 });
    }
    if (password.length < 8 || password.length > 72) {
      return NextResponse.json({ error: "密碼需為 8–72 字元。" }, { status: 400 });
    }
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: "無效的角色。" }, { status: 400 });
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
      .update({ account_code: accountCode, display_name: displayName, is_active: true })
      .eq("id", createdUserId);
    if (profileError) throw profileError;

    const { error: deleteRolesError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", createdUserId);
    if (deleteRolesError) throw deleteRolesError;

    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: createdUserId,
      role,
      granted_by: admin.userId,
    });
    if (roleError) throw roleError;

    return NextResponse.json(
      { ok: true, user: { id: createdUserId, accountCode, displayName, role } },
      { status: 201 }
    );
  } catch (error) {
    if (createdUserId) {
      await getSupabaseAdminClient().auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
