import "server-only";

import type { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { requireActiveUser, type VerifiedUser } from "@/lib/auth/require-admin";

export type CommunicationActor = VerifiedUser & {
  communicationRole: "admin" | "coordinator";
};

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

export async function requireCommunicationActor(
  request: NextRequest
): Promise<CommunicationActor> {
  const user = await requireActiveUser(request);
  if (user.roles.includes("admin")) {
    return { ...user, communicationRole: "admin" };
  }
  if (user.roles.includes("coordinator")) {
    return { ...user, communicationRole: "coordinator" };
  }
  fail("目前只有管理員與總招可以使用訊息功能。", 403);
}

export async function getCommunicationPeer(actor: CommunicationActor, peerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(peerId) || peerId === actor.userId) {
    fail("對話對象無效。");
  }

  const supabase = getSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: roles, error: roleError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,display_name,is_active,avatar_config")
        .eq("id", peerId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", peerId),
    ]);

  if (profileError || roleError) throw profileError || roleError;
  if (!profile?.is_active) fail("此帳號目前無法使用通訊功能。", 404);

  const peerRoles = (roles ?? []).map((row) => String(row.role));
  const allowed =
    (actor.communicationRole === "admin" && peerRoles.includes("coordinator"))
    || (actor.communicationRole === "coordinator" && peerRoles.includes("admin"));

  if (!allowed) fail("你沒有與此帳號建立私人對話的權限。", 403);

  return {
    id: String(profile.id),
    displayName: String(profile.display_name || "同工"),
    avatarConfig: profile.avatar_config,
    roles: peerRoles,
  };
}

export function communicationErrorResponse(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "目前無法完成通訊操作，請稍後再試。";
  return { status, message };
}
