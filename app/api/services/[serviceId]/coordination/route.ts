import { NextRequest, NextResponse } from "next/server";
import { normalizeAccountCode } from "@/lib/auth/account-code";
import { requireAdmin, requireCoordinatorForService } from "@/lib/auth/require-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSIGNMENT_STATUSES = new Set(["scheduled", "confirmed", "declined", "completed", "cancelled"]);
type ServiceRouteContext = { params: Promise<{ serviceId: string }> };

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function errorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status) || 500
    : 500;
  return NextResponse.json({
    error: status < 500 && error instanceof Error ? error.message : "伺服器無法完成場次管理操作。",
  }, { status });
}

async function resolveServiceId(context: ServiceRouteContext) {
  const { serviceId } = await context.params;
  if (!UUID_PATTERN.test(serviceId)) fail("場次識別資料無效。");
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

export async function GET(request: NextRequest, context: ServiceRouteContext) {
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
        supabase.from("timeline_nodes").select("id,service_id,source_template_node_id,service_type,time,title,assignee,location,is_active").order("sort_order").order("time"),
        supabase.from("service_coordinators").select("id,user_id").eq("service_id", serviceId),
      ]);

    const firstError = [serviceResult, assignmentResult, stationResult, mappingResult, nodeResult, coordinatorResult]
      .find((result) => result.error)?.error;
    if (firstError) throw firstError;
    if (!serviceResult.data) fail("找不到可查看的場次。", 404);

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
    const relevantRows = (nodeResult.data ?? []).filter(
      (node) => node.service_id === serviceId
        || (node.service_id === null && node.service_type === service.service_type)
    );
    const shadowedTemplateIds = new Set(
      relevantRows
        .filter((node) => node.service_id === serviceId)
        .map((node) => node.source_template_node_id)
        .filter(Boolean)
    );
    const tasks = relevantRows.filter((node) => (
      node.service_id === serviceId
        ? node.is_active
        : node.is_active && !shadowedTemplateIds.has(node.id)
    ));

    return NextResponse.json({
      service,
      assignments,
      stations: stationResult.data ?? [],
      taskMappings: mappingResult.data ?? [],
      tasks,
      coordinators: coordinatorRows,
      profiles: profiles ?? [],
      canManageSchedule: actor.roles.includes("admin"),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: ServiceRouteContext) {
  try {
    const serviceId = await resolveServiceId(context);
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const supabase = getSupabaseUserClient(request);

    if (action === "grant_coordinator") {
      const accountCode = normalizeAccountCode(body.accountCode);
      const profile = await findActiveProfileByAccountCode(accountCode);
      if (!profile) fail("找不到有效的帶領者／協調員帳號。", 404);
      const { data: coordinatorRole, error: roleError } = await getSupabaseAdminClient()
        .from("user_roles")
        .select("user_id")
        .eq("user_id", profile.id)
        .eq("role", "coordinator")
        .maybeSingle();
      if (roleError) throw roleError;
      if (!coordinatorRole) fail("此帳號尚未設定為帶領者／協調員。", 409);
      const { data, error } = await supabase
        .from("service_coordinators")
        .upsert({ service_id: serviceId, user_id: profile.id, granted_by: admin.userId }, { onConflict: "service_id,user_id" })
        .select("id,user_id")
        .single();
      if (error) throw error;
      return NextResponse.json({ coordinator: data }, { status: 201 });
    }

    if (action === "create_assignment") {
      const accountCode = normalizeAccountCode(body.accountCode);
      const roleLabel = String(body.roleLabel ?? "").normalize("NFKC").trim();
      const stationId = String(body.stationId ?? "").trim();
      const profile = await findActiveProfileByAccountCode(accountCode);
      if (!profile) fail("找不到有效的同工帳號。", 404);
      if (!roleLabel || roleLabel.length > 80 || (stationId && !UUID_PATTERN.test(stationId))) {
        fail("角色或崗位資料無效。");
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
        if (!station) fail("崗位不屬於此場次。");
      }
      const { data, error } = await supabase
        .from("service_assignments")
        .insert({ service_id: serviceId, user_id: profile.id, station_id: stationId || null, role_label: roleLabel, status: "scheduled", created_by: admin.userId })
        .select("id,user_id,station_id,role_label,status")
        .single();
      if (error?.code === "23505") fail("此同工在該場次已有相同角色分派。", 409);
      if (error) throw error;
      return NextResponse.json({ assignment: data }, { status: 201 });
    }

    if (action === "update_assignment") {
      const assignmentId = String(body.assignmentId ?? "").trim();
      const roleLabel = String(body.roleLabel ?? "").normalize("NFKC").trim();
      const stationId = String(body.stationId ?? "").trim();
      const status = String(body.status ?? "scheduled");
      if (!UUID_PATTERN.test(assignmentId) || !roleLabel || roleLabel.length > 80 || !ASSIGNMENT_STATUSES.has(status) || (stationId && !UUID_PATTERN.test(stationId))) {
        fail("分派資料無效。");
      }
      const { data, error } = await supabase
        .from("service_assignments")
        .update({ station_id: stationId || null, role_label: roleLabel, status })
        .eq("id", assignmentId)
        .eq("service_id", serviceId)
        .select("id,user_id,station_id,role_label,status")
        .maybeSingle();
      if (error) throw error;
      if (!data) fail("找不到可更新的分派。", 404);
      return NextResponse.json({ assignment: data });
    }

    if (action === "map_task") {
      const assignmentId = String(body.assignmentId ?? "").trim();
      const nodeId = String(body.nodeId ?? "").trim();
      if (!UUID_PATTERN.test(assignmentId) || !nodeId || nodeId.length > 160) fail("任務分派資料無效。");
      const { data, error } = await supabase
        .from("service_task_assignments")
        .insert({ service_id: serviceId, assignment_id: assignmentId, timeline_node_id: nodeId, created_by: admin.userId })
        .select("id,assignment_id,timeline_node_id")
        .single();
      if (error?.code === "23505") fail("此任務已分派給該同工。", 409);
      if (error) throw error;
      return NextResponse.json({ taskMapping: data }, { status: 201 });
    }

    fail("不支援的管理操作。");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: ServiceRouteContext) {
  try {
    const serviceId = await resolveServiceId(context);
    await requireAdmin(request);
    const kind = request.nextUrl.searchParams.get("kind") ?? "";
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!UUID_PATTERN.test(id)) fail("刪除目標無效。");
    const supabase = getSupabaseUserClient(request);

    if (kind === "coordinator") {
      const { error } = await supabase.from("service_coordinators").delete().eq("id", id).eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (kind === "assignment") {
      const [{ data: checkIns, error: checkInError }, { data: states, error: stateError }] = await Promise.all([
        supabase.from("service_check_ins").select("id").eq("service_id", serviceId).eq("assignment_id", id).limit(1),
        supabase.from("assignment_checklist_states").select("id").eq("service_id", serviceId).eq("assignment_id", id).limit(1),
      ]);
      if (checkInError || stateError) throw checkInError || stateError;
      if (checkIns?.length || states?.length) fail("此分派已有報到或清單紀錄，不能刪除；請改為取消狀態。", 409);
      const { error } = await supabase.from("service_assignments").delete().eq("id", id).eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (kind === "task_mapping") {
      const { data: mapping, error: mappingError } = await supabase
        .from("service_task_assignments")
        .select("assignment_id,timeline_node_id")
        .eq("id", id)
        .eq("service_id", serviceId)
        .maybeSingle();
      if (mappingError) throw mappingError;
      if (!mapping) fail("找不到任務分派。", 404);
      const { data: checklist, error: checklistError } = await supabase
        .from("checklist_items")
        .select("id")
        .eq("node_id", mapping.timeline_node_id);
      if (checklistError) throw checklistError;
      const checklistIds = (checklist ?? []).map((item) => item.id);
      if (checklistIds.length) {
        const { data: states, error: stateError } = await supabase
          .from("assignment_checklist_states")
          .select("id")
          .eq("service_id", serviceId)
          .eq("assignment_id", mapping.assignment_id)
          .in("checklist_item_id", checklistIds)
          .limit(1);
        if (stateError) throw stateError;
        if (states?.length) fail("此任務已有清單進度，不能移除分派。", 409);
      }
      const { error } = await supabase.from("service_task_assignments").delete().eq("id", id).eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    fail("刪除類型無效。");
  } catch (error) {
    return errorResponse(error);
  }
}
