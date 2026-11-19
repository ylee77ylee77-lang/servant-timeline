import { NextRequest, NextResponse } from "next/server";
import { accountCodeToInternalEmail, isValidAccountCode, normalizeAccountCode } from "@/lib/auth/account-code";
import { isValidContactEmail, normalizeContactEmail } from "@/lib/auth/password-reset";
import { getAuthErrorResponse, requireAdmin } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_ROLES = new Set(["volunteer", "coordinator", "admin"]);

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const supabase = getSupabaseAdminClient();

    const [
      { data: profiles, error: profileError },
      { data: roleRows, error: roleError },
      { data: contactRows, error: contactError },
    ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,account_code,display_name,is_active")
          .order("display_name", { ascending: true }),
        supabase
          .from("user_roles")
          .select("user_id,role"),
        supabase
          .from("account_recovery_contacts")
          .select("user_id,contact_email"),
      ]);

    if (profileError) throw profileError;
    if (roleError) throw roleError;
    if (contactError) throw contactError;

    const roleMap = new Map<string, string[]>();
    for (const row of roleRows ?? []) {
      const userId = String(row.user_id);
      const current = roleMap.get(userId) ?? [];
      current.push(String(row.role));
      roleMap.set(userId, current);
    }

    const contactMap = new Map(
      (contactRows ?? []).map((row) => [String(row.user_id), String(row.contact_email || "")])
    );

    const users = (profiles ?? [])
      .filter((profile) => Boolean(profile.account_code))
      .map((profile) => ({
        id: String(profile.id),
        accountCode: String(profile.account_code ?? ""),
        displayName: String(profile.display_name ?? "同工"),
        contactEmail: contactMap.get(String(profile.id)) ?? "",
        isActive: Boolean(profile.is_active),
        roles: roleMap.get(String(profile.id)) ?? [],
      }));

    const adminCount = users.filter(
      (user) => user.isActive && user.roles.includes("admin")
    ).length;

    return NextResponse.json({
      adminCount,
      users,
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId ?? "").trim();
    const action = String(body.action ?? "");

    if (!userId) {
      return NextResponse.json({ error: "缺少帳號識別資料。" }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();

    if (action === "update-recovery-email") {
      const contactEmail = normalizeContactEmail(body.contactEmail);
      if (!isValidContactEmail(contactEmail)) {
        return NextResponse.json({ error: "請輸入有效的聯絡 Email。" }, { status: 400 });
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id,account_code,display_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        return NextResponse.json({ error: "找不到這個服事帳號。" }, { status: 404 });
      }

      const { error: contactError } = await supabase
        .from("account_recovery_contacts")
        .upsert({
          user_id: userId,
          contact_email: contactEmail,
          updated_at: new Date().toISOString(),
        });
      if (contactError) throw contactError;

      return NextResponse.json({
        ok: true,
        user: {
          id: String(profile.id),
          accountCode: String(profile.account_code ?? ""),
          displayName: String(profile.display_name ?? "同工"),
          contactEmail,
        },
      });
    }

    if (action !== "activate-coordinator") {
      return NextResponse.json({ error: "無效的帳號操作。" }, { status: 400 });
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,account_code,display_name,is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: "找不到這個服事帳號。" }, { status: 404 });
    }
    if (profile.is_active) {
      return NextResponse.json({ error: "這個帳號已經啟用。" }, { status: 409 });
    }

    const { data: existingRoles, error: existingRoleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (existingRoleError) throw existingRoleError;

    if ((existingRoles ?? []).length > 0) {
      return NextResponse.json(
        { error: "此停用帳號已有角色設定，請由管理員另外確認後再處理。" },
        { status: 409 }
      );
    }

    const { error: activateError } = await supabase
      .from("profiles")
      .update({ is_active: true })
      .eq("id", userId);
    if (activateError) throw activateError;

    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role: "coordinator",
      granted_by: admin.userId,
    });
    if (roleError) {
      await supabase.from("profiles").update({ is_active: false }).eq("id", userId);
      throw roleError;
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: String(profile.id),
        accountCode: String(profile.account_code ?? ""),
        displayName: String(profile.display_name ?? "同工"),
        role: "coordinator",
      },
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const accountCode = normalizeAccountCode(body.accountCode);
    const displayName = String(body.displayName ?? "").normalize("NFKC").trim();
    const contactEmail = normalizeContactEmail(body.contactEmail);
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
    if (!isValidContactEmail(contactEmail)) {
      return NextResponse.json({ error: "請輸入有效的聯絡 Email。" }, { status: 400 });
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
      .upsert(
        { id: createdUserId, account_code: accountCode, display_name: displayName, is_active: true },
        { onConflict: "id" }
      );
    if (profileError) throw profileError;

    const { error: contactError } = await supabase
      .from("account_recovery_contacts")
      .upsert({
        user_id: createdUserId,
        contact_email: contactEmail,
        updated_at: new Date().toISOString(),
      });
    if (contactError) throw contactError;

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
