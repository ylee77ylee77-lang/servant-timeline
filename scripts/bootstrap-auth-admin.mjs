import { createClient } from "@supabase/supabase-js";

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const accountCode = String(process.env.BOOTSTRAP_ACCOUNT_CODE || "")
  .normalize("NFKC")
  .trim()
  .toLowerCase();
const password = String(process.env.BOOTSTRAP_PASSWORD || "");
const displayName = String(process.env.BOOTSTRAP_DISPLAY_NAME || "").normalize("NFKC").trim();
const accountCodePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;

if (!url || !serviceRoleKey || !accountCode || !password || !displayName) {
  throw new Error("缺少 bootstrap 所需的環境變數；未建立任何帳號。");
}
if (!accountCodePattern.test(accountCode)) {
  throw new Error("BOOTSTRAP_ACCOUNT_CODE 格式無效。");
}
if (password.length < 8 || password.length > 72) {
  throw new Error("BOOTSTRAP_PASSWORD 必須為 8–72 字元。");
}
if (displayName.length > 80) {
  throw new Error("BOOTSTRAP_DISPLAY_NAME 不得超過 80 字元。");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
let createdUserId = null;

try {
  const { count, error: adminCountError } = await supabase
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if (adminCountError) throw adminCountError;
  if ((count || 0) > 0) {
    throw new Error("系統已存在管理員；請改用網頁帳號管理功能。");
  }

  const { data, error: createError } = await supabase.auth.admin.createUser({
    email: `${accountCode}@auth.servant-timeline.invalid`,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (createError || !data.user) throw createError || new Error("建立 Auth 使用者失敗。");
  createdUserId = data.user.id;

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: createdUserId, account_code: accountCode, display_name: displayName, is_active: true },
      { onConflict: "id" }
    );
  if (profileError) throw profileError;

  const { error: deleteRoleError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", createdUserId);
  if (deleteRoleError) throw deleteRoleError;

  const { error: roleError } = await supabase.from("user_roles").insert({
    user_id: createdUserId,
    role: "admin",
    granted_by: createdUserId,
  });
  if (roleError) throw roleError;

  console.log("首位管理員已建立。請立即清除 bootstrap 環境變數。");
} catch (error) {
  if (createdUserId) {
    await supabase.auth.admin.deleteUser(createdUserId).catch(() => undefined);
  }
  throw error;
}
