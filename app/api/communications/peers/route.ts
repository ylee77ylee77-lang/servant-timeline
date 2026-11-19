import { NextRequest, NextResponse } from "next/server";
import { communicationErrorResponse, requireCommunicationActor } from "@/lib/communications/access";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const supabase = getSupabaseAdminClient();
    const targetRole = actor.communicationRole === "admin" ? "coordinator" : "admin";

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", targetRole);
    if (roleError) throw roleError;

    const ids = Array.from(new Set((roleRows ?? []).map((row) => String(row.user_id))));
    const { data: profiles, error: profileError } = ids.length
      ? await supabase
          .from("profiles")
          .select("id,display_name,account_code,avatar_config,is_active")
          .in("id", ids)
          .eq("is_active", true)
      : { data: [], error: null };
    if (profileError) throw profileError;

    const { data: unreadRows, error: unreadError } = await supabase
      .from("communication_messages")
      .select("sender_id")
      .eq("recipient_id", actor.userId)
      .is("read_at", null)
      .is("retracted_at", null);
    if (unreadError) throw unreadError;

    const unreadByPeer = new Map<string, number>();
    for (const row of unreadRows ?? []) {
      const senderId = String(row.sender_id);
      unreadByPeer.set(senderId, (unreadByPeer.get(senderId) ?? 0) + 1);
    }

    const peers = (profiles ?? [])
      .map((profile) => ({
        id: String(profile.id),
        displayName: String(profile.display_name || "同工"),
        accountCode: String(profile.account_code || ""),
        avatarConfig: normalizeAvatarConfig(profile.avatar_config),
        unreadCount: unreadByPeer.get(String(profile.id)) ?? 0,
      }))
      .sort((a, b) => b.unreadCount - a.unreadCount || a.displayName.localeCompare(b.displayName, "zh-Hant"));

    return NextResponse.json({
      peers,
      actor: {
        id: actor.userId,
        displayName: actor.displayName,
        role: actor.communicationRole,
      },
    });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
