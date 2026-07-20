import { NextRequest, NextResponse } from "next/server";
import { normalizeAccountCode } from "@/lib/auth/account-code";
import {
  getAuthErrorResponse,
  requireAdmin,
  requireCoordinatorForService,
} from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENT_STATUSES = new Set(["scheduled", "confirmed", "declined", "completed", "cancelled"]);
type ServiceRouteContext = { params: Promise<{ serviceId: string }> };

async function resolveServiceId(context: ServiceRouteContext) {
  const { serviceId } = await context.params;
  if (!UUID_PATTERN.test(serviceId)) {
    throw Object.assign(new Error("場次識別資料無效。"), { status: 400 });
  }
  return serviceId;
}

async function findActiveProfileByAccountCode(accountCode: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("profiles")
    .select("id,display_name,account_code,is_active")
    .eq("account_code", accountCode)
    .maybeSingle();
  if (error) throw error;
  return data?.is_active ? data : null;
}

export async function GET(
  request: NextRequest,
  context: ServiceRouteContext
) {
  try {
    const serviceId = await resolveServiceId(context);
    const actor = await requireCoordinatorForService(request, serviceId);
    const supabase = getSupabaseUserClient(request);

    const [serviceResult, assignmentResult, stationResult, mappingResult, nodeResult, coordinatorResult] =
      await Promise.all([
        supabase.from("worship_services").select("id,service_date,service_type,starts_at,report_at,location,status").eq("id", serviceId).maybeSingle(),
        supabase.from("service_assignments").select("id,user_id,station_id,role_label,report_at,report_location,status,notes").eq("service_id", serviceId).order("created_at"),
        supabase.from("service_stations").select("id,name,role_label,is_active,sort_order").eq("service_id", serviceId).order("sort_order"),
        supabase.from("service_task_assignments").select("id,assignment_id,timeline_node_id").eq("service_id", serviceId),
        supabase.from("timeline_nodes").select("id,service_id,service_type,time,title,assignee,location").order("time"),
        supabase.from("service_coordinators").select("id,user_id").eq("service_id", serviceId),
      ]);

    const firstError = [serviceResult, assignmentResult, stationResult, mappingResult, nodeResult, coordinatorResult]
      .find((result) => result.error)?.error;
    if (firstError) throw firstError;
    if (!serviceResult.data) {
      return NextResponse.json({ error: "找不到可管理的場次。" }, { status: 404 });
    }

    const assignments = assignmentResult.data ?? [];
    const coordinatorRows = coordinatorResult.data ?? [];
    const profileIds = Array.from(new Set([
      ...assignments.map((assignment) => assignment.user_id),
      ...coordinatorRows.map((coordinator) => coordinator.user_id),
    ]));
    const { data: profiles, error: profileError } = profileIds.length
      ? await supabase.from("profiles").select("id,display_name,account_code").in("id", profileIds)
      : { data: [], error: null };
    if (profileError) throw profileError;

    const service = serviceResult.data;
    const tasks = (nodeResult.data ?? []).filter(
      (node) => node.service_id === serviceId
        || (node.service_id === null && node.service_type === service.service_type)
    );

    return NextResponse.json({
      service,
      assignments,
      stations: stationResult.data ?? [],
      taskMappings: mappingResult.data ?? [],
      tasks,
      coordinators: coordinatorRows,
      profiles: profiles ?? [],
      canGrantCoordinators: actor.roles.includes("admin"),
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function POST(
  request: NextRequest,
  context: ServiceRouteContext
) {
  try {
    const serviceId = await resolveServiceId(context);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const supabase = getSupabaseUserClient(request);

    if (action === "grant_coordinator") {
      const admin = await requireAdmin(request);
      const accountCode = normalizeAccountCode(body.accountCode);
      const profile = await findActiveProfileByAccountCode(accountCode);
      if (!profile) {
        return NextResponse.json({ error: "找不到有效的帶領者／協調員帳號。" }, { status: 404 });
      }

      const { data: coordinatorRole, error: roleError } = await getSupabaseAdminClient()
        .from("user_roles")
        .select("user_id")
        .eq("user_id", profile.id)
        .eq("role", "coordinator")
        .maybeSingle();
      if (roleError) throw roleError;
      if (!coordinatorRole) {
        return NextResponse.json({ error: "此帳號尚未設定為帶領者／協調員。" }, { status: 409 });
      }

      const { data, error } = await supabase
        .from("service_coordinators")
        .upsert({ service_id: serviceId, user_id: profile.id, granted_by: admin.userId }, { onConflict: "service_id,user_id" })
        .select("id,user_id")
        .single();
      if (error) throw error;
      return NextResponse.json({ coordinator: data }, { status: 201 });
    }

    const actor = await requireCoordinatorForService(request, serviceId);

    if (action === "create_assignment") {
      const accountCode = normalizeAccountCode(body.accountCode);
      const roleLabel = String(body.roleLabel ?? "").normalize("NFKC").trim();
      const stationId = String(body.stationId ?? "").trim();
      const profile = await findActiveProfileByAccountCode(accountCode);
      if (!profile) {
        return NextResponse.json({ error: "找不到有效的同工帳號。" }, { status: 404 });
      }
      if (!roleLabel || roleLabel.length > 80 || (stationId && !UUID_PATTERN.test(stationId))) {
        return NextResponse.json({ error: "角色或崗位資料無效。" }, { status: 400 });
      }

      if (stationId) {
        const { data: station, error: stationError } = await supabase
          .from("service_stations")
          .select("id")
          .eq("id", stationId)
          .eq("service_id", serviceId)
          .eq("is_active", true)
          .maybeSingle();
        if (stationError) throw stationError;
        if (!station) return NextResponse.json({ error: "崗位不屬於此場次。" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("service_assignments")
        .insert({
          service_id: serviceId,
          user_id: profile.id,
          station_id: stationId || null,
          role_label: roleLabel,
          status: "scheduled",
          created_by: actor.userId,
        })
        .select("id,user_id,station_id,role_label,status")
        .single();
      if (error?.code === "23505") {
        return NextResponse.json({ error: "此同工在該場次已有相同角色分派。" }, { status: 409 });
      }
      if (error) throw error;
      return NextResponse.json({ assignment: data }, { status: 201 });
    }

    if (action === "update_assignment") {
      const assignmentId = String(body.assignmentId ?? "").trim();
      const roleLabel = String(body.roleLabel ?? "").normalize("NFKC").trim();
      const stationId = String(body.stationId ?? "").trim();
      const status = String(body.status ?? "scheduled");
      if (!UUID_PATTERN.test(assignmentId) || !roleLabel || roleLabel.length > 80 || !ASSIGNMENT_STATUSES.has(status) || (stationId && !UUID_PATTERN.test(stationId))) {
        return NextResponse.json({ error: "分派資料無效。" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("service_assignments")
        .update({ station_id: stationId || null, role_label: roleLabel, status })
        .eq("id", assignmentId)
        .eq("service_id", serviceId)
        .select("id,user_id,station_id,role_label,status")
        .maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "找不到可更新的分派。" }, { status: 404 });
      return NextResponse.json({ assignment: data });
    }

    if (action === "map_task") {
      const assignmentId = String(body.assignmentId ?? "").trim();
      const nodeId = String(body.nodeId ?? "").trim();
      if (!UUID_PATTERN.test(assignmentId) || !nodeId || nodeId.length > 160) {
        return NextResponse.json({ error: "任務分派資料無效。" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("service_task_assignments")
        .insert({ service_id: serviceId, assignment_id: assignmentId, timeline_node_id: nodeId, created_by: actor.userId })
        .select("id,assignment_id,timeline_node_id")
        .single();
      if (error?.code === "23505") {
        return NextResponse.json({ error: "此任務已分派給該同工。" }, { status: 409 });
      }
      if (error) throw error;
      return NextResponse.json({ taskMapping: data }, { status: 201 });
    }

    return NextResponse.json({ error: "不支援的協調操作。" }, { status: 400 });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}

export async function DELETE(
  request: NextRequest,
  context: ServiceRouteContext
) {
  try {
    const serviceId = await resolveServiceId(context);
    const kind = request.nextUrl.searchParams.get("kind") ?? "";
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "刪除目標無效。" }, { status: 400 });
    }

    const supabase = getSupabaseUserClient(request);
    if (kind === "coordinator") {
      await requireAdmin(request);
      const { error } = await supabase.from("service_coordinators").delete().eq("id", id).eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    await requireCoordinatorForService(request, serviceId);
    const table = kind === "assignment"
      ? "service_assignments"
      : kind === "task_mapping"
        ? "service_task_assignments"
        : null;
    if (!table) return NextResponse.json({ error: "刪除類型無效。" }, { status: 400 });

    const { error } = await supabase.from(table).delete().eq("id", id).eq("service_id", serviceId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
