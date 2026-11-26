import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getBackgroundPushConfig, getAdminTimelinePushConfig } from "@/lib/notifications/background-config";
import { validDispatcherAuthorization, sendBackgroundPush } from "@/lib/notifications/background-push";
import { dispatchBackgroundReminders, type Claim, type Taken } from "@/lib/notifications/dispatch-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No user-facing invocation, no client-supplied time, recipients or task IDs.
// This endpoint remains off until a reviewed migration and scheduler are enabled.
export async function POST(request: NextRequest) {
  const formalConfig = getBackgroundPushConfig();
  const adminConfig = getAdminTimelinePushConfig();
  const config = formalConfig ?? adminConfig;
  const headers = { "Cache-Control": "no-store" };
  if (!config || !validDispatcherAuthorization(request.headers.get("authorization"), config.dispatcherSecret)) {
    return NextResponse.json({ error: "Unavailable" }, { status: 404, headers });
  }
  try {
    const db = getSupabaseAdminClient();
    const dispatch = (adminTest: boolean) => dispatchBackgroundReminders({
      claim: async limit => {
        const { data, error } = await db.rpc(adminTest ? "claim_admin_timeline_reminders" : "claim_background_task_reminders", { p_limit: limit });
        if (error) throw new Error("Claim failed");
        return (data ?? []) as Claim[];
      },
      take: async id => {
        const { data, error } = await db.rpc(adminTest ? "take_admin_timeline_reminder" : "take_background_task_reminder", { p_delivery_id: id });
        if (error) throw new Error("Take failed");
        return (Array.isArray(data) ? data[0] ?? null : null) as Taken | null;
      },
      finish: async (id, state, status) => {
        const { data, error } = await db.rpc(adminTest ? "finish_admin_timeline_reminder" : "finish_background_task_reminder", {
          p_delivery_id: id, p_state: state, p_provider_status: status,
        });
        if (error) throw new Error("Finish failed");
        return data === true;
      },
    }, (subscription, cue) => sendBackgroundPush(subscription, adminTest ? { ...cue, adminTest: true } : cue, config.keys));
    // Preserve the formal route's existing response when testing is off.
    if (!adminConfig) return NextResponse.json(await dispatch(false), { headers });
    // A failing test-only RPC must never prevent a formal delivery.
    const [formal, admin] = await Promise.allSettled([
      formalConfig ? dispatch(false) : Promise.resolve(null),
      dispatch(true),
    ]);
    return NextResponse.json({
      ...(formal.status === "fulfilled" && formal.value ? formal.value : {}),
      ...(formal.status === "rejected" ? { formalError: true } : {}),
      adminTest: admin.status === "fulfilled" ? admin.value : { error: true },
    }, { headers, status: formal.status === "rejected" || admin.status === "rejected" ? 503 : 200 });
  } catch {
    // No underlying provider or database errors (may contain credentials).
    return NextResponse.json({ error: "Dispatch unavailable" }, { status: 503, headers });
  }
}
