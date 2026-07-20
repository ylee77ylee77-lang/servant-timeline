import { NextRequest, NextResponse } from "next/server";
import {
  getAuthErrorResponse,
  requireActiveUser,
  requireCoordinatorForService,
} from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const body = await request.json().catch(() => ({}));
    const assignmentId = String(body.assignmentId ?? "").trim();
    const itemId = String(body.itemId ?? "").trim();
    const isCompleted = body.isCompleted === true;

    if (!UUID_PATTERN.test(assignmentId) || !itemId || itemId.length > 160) {
      return NextResponse.json({ error: "任務清單識別資料無效。" }, { status: 400 });
    }

    const { data: assignment, error: assignmentError } = await getSupabaseAdminClient()
      .from("service_assignments")
      .select("service_id,user_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) {
      return NextResponse.json({ error: "找不到可操作的任務清單。" }, { status: 404 });
    }

    if (assignment.user_id !== user.userId) {
      await requireCoordinatorForService(request, assignment.service_id);
    }

    const { data, error } = await getSupabaseUserClient(request).rpc(
      "set_assignment_checklist_state",
      {
        p_assignment_id: assignmentId,
        p_item_id: itemId,
        p_is_completed: isCompleted,
      }
    );
    if (error) {
      if (error.code === "42501") {
        throw Object.assign(new Error("你不能修改這個任務清單。"), { status: 403 });
      }
      throw error;
    }

    return NextResponse.json({ state: data?.[0] ?? null });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
