import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const { data, error } = await getSupabaseAdminClient()
      .from("profiles")
      .select("avatar_config")
      .eq("id", user.userId)
      .single();
    if (error) throw error;
    return NextResponse.json({ avatarConfig: normalizeAvatarConfig(data.avatar_config) });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const body = await request.json().catch(() => ({}));
    const avatarConfig = normalizeAvatarConfig(body.avatarConfig);

    const { data, error } = await getSupabaseAdminClient()
      .from("profiles")
      .update({ avatar_config: avatarConfig })
      .eq("id", user.userId)
      .select("avatar_config")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, avatarConfig: normalizeAvatarConfig(data.avatar_config) });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
