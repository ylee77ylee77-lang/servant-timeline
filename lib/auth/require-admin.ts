import "server-only";

import type { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export type VerifiedAdmin = {
  userId: string;
  displayName: string;
};

export type VerifiedUser = VerifiedAdmin & {
  roles: string[];
};

export async function requireActiveUser(request: NextRequest): Promise<VerifiedUser> {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const accessToken = match?.[1]?.trim();

  if (!accessToken) {
    throw Object.assign(new Error("請先登入。"), { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    throw Object.assign(new Error("登入階段已失效，請重新登入。"), { status: 401 });
  }

  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,is_active")
        .eq("id", userData.user.id)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id),
    ]);

  if (profileError || roleError) {
    throw Object.assign(new Error("無法確認管理權限。"), { status: 500 });
  }

  if (!profile?.is_active) {
    throw Object.assign(new Error("帳號尚未啟用。"), { status: 403 });
  }

  return {
    userId: userData.user.id,
    displayName: String(profile.display_name || "同工"),
    roles: (roleRows ?? []).map((row) => String(row.role)),
  };
}

export async function requireAdmin(request: NextRequest): Promise<VerifiedAdmin> {
  const user = await requireActiveUser(request);
  if (!user.roles.includes("admin")) {
    throw Object.assign(new Error("你沒有管理員權限。"), { status: 403 });
  }
  return { userId: user.userId, displayName: user.displayName };
}

export async function requireCoordinator(request: NextRequest): Promise<VerifiedUser> {
  const user = await requireActiveUser(request);
  if (!user.roles.some((role) => role === "coordinator" || role === "admin")) {
    throw Object.assign(new Error("你沒有總招或管理員權限。"), { status: 403 });
  }
  return user;
}

export function getAuthErrorResponse(error: unknown) {
  const explicitStatus =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
  const isAuthorizationError = explicitStatus === 401 || explicitStatus === 403;
  const message =
    isAuthorizationError && error instanceof Error
      ? error.message
      : "伺服器無法確認權限。";

  return { status: explicitStatus, message };
}
