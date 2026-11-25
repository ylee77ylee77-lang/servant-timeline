import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getBackgroundPushConfig } from "@/lib/notifications/background-config";
import { validDispatcherSecret, sendBackgroundPush } from "@/lib/notifications/background-push";
import { dispatchBackgroundReminders, type Claim, type Taken } from "@/lib/notifications/dispatch-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// No user-facing invocation, no client-supplied time, recipients or task IDs.
// This endpoint remains off until a reviewed migration and scheduler are enabled.
export async function POST(request: NextRequest) {
  const config = getBackgroundPushConfig();
  const headers = { "Cache-Control": "no-store" };
  if (!config || !validDispatcherSecret(request.headers.get("authorization"), config.dispatcherSecret)) {
    return NextResponse.json({ error: "Unavailable" }, { status: 404, headers });
  }
  try {
    const db = getSupabaseAdminClient();
    const results = await dispatchBackgroundReminders({
      claim: async limit => {
        const { data, error } = await db.rpc("claim_background_task_reminders", { p_limit: limit });
        if (error) throw new Error("Claim failed");
        return (data ?? []) as Claim[];
      },
      take: async id => {
        const { data, error } = await db.rpc("take_background_task_reminder", { p_delivery_id: id });
        if (error) throw new Error("Take failed");
        return (Array.isArray(data) ? data[0] ?? null : null) as Taken | null;
      },
      finish: async (id, state, status) => {
        const { data, error } = await db.rpc("finish_background_task_reminder", {
          p_delivery_id: id, p_state: state, p_provider_status: status,
        });
        if (error) throw new Error("Finish failed");
        return data === true;
      },
    }, (subscription, cue) => sendBackgroundPush(subscription, cue, config.keys));
    return NextResponse.json(results, { headers });
  } catch {
    // No underlying provider or database errors (may contain credentials).
    return NextResponse.json({ error: "Dispatch unavailable" }, { status: 503, headers });
  }
}
