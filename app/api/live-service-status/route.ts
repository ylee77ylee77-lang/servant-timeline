import { NextRequest, NextResponse } from "next/server";
import {
  getAuthErrorResponse,
  requireCoordinator,
  requireLiveCoordinatorForService,
} from "@/lib/auth/require-admin";
import { deriveLiveServiceStatus } from "@/lib/services/live-service-status";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function taipeiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function selectCurrentService<
  T extends { id: string; service_date: string; status: string }
>(services: T[], requestedServiceId: string) {
  if (requestedServiceId) {
    return services.find((service) => service.id === requestedServiceId) ?? null;
  }

  const today = taipeiDateKey();
  const chronological = [...services].sort((left, right) => (
    left.service_date.localeCompare(right.service_date)
  ));
  return chronological.find((service) => service.service_date === today && service.status === "published")
    ?? chronological.find((service) => service.service_date >= today && service.status === "published")
    ?? [...chronological].reverse().find((service) => service.status === "completed")
    ?? chronological[0]
    ?? null;
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);
    const requestedServiceId = request.nextUrl.searchParams.get("serviceId")?.trim() ?? "";
    if (requestedServiceId && !UUID_PATTERN.test(requestedServiceId)) {
      return response({ error: "場次識別資料無效。" }, 400);
    }

    const supabase = getSupabaseUserClient(request);
    const { data: serviceRows, error: serviceError } = await supabase
      .from("worship_services")
      .select("id,service_date,service_type,starts_at,report_at,location,status")
      .order("service_date", { ascending: false })
      .order("starts_at", { ascending: false })
      .limit(30);
    if (serviceError) throw serviceError;

    const services = serviceRows ?? [];
    const service = selectCurrentService(services, requestedServiceId);
    if (requestedServiceId && !service) {
      return response({ error: "找不到可查看的場次。" }, 404);
    }
    if (!service) {
      return response({ services: [], service: null, scope: null, summary: null, volunteers: [], validation: null });
    }

    const actor = await requireLiveCoordinatorForService(request, service.id);
    const [
      assignmentResult,
      stationResult,
      checkInResult,
      confirmationResult,
      mappingResult,
      checklistStateResult,
    ] = await Promise.all([
      supabase
        .from("service_assignments")
        .select("id,user_id,station_id,role_label,ministry_group,status")
        .eq("service_id", service.id)
        .in("status", ["scheduled", "confirmed", "completed"])
        .order("created_at"),
      supabase
        .from("service_stations")
        .select("id,name,is_active,sort_order")
        .eq("service_id", service.id)
        .order("sort_order"),
      supabase
        .from("service_check_ins")
        .select("id,assignment_id,status,checked_in_at")
        .eq("service_id", service.id),
      supabase
        .from("check_in_station_confirmations")
        .select("check_in_id,station_id,confirmed_at")
        .eq("service_id", service.id),
      supabase
        .from("service_task_assignments")
        .select("assignment_id,timeline_node_id")
        .eq("service_id", service.id),
      supabase
        .from("assignment_checklist_states")
        .select("assignment_id,checklist_item_id,is_completed")
        .eq("service_id", service.id),
    ]);
    const firstError = [
      assignmentResult,
      stationResult,
      checkInResult,
      confirmationResult,
      mappingResult,
      checklistStateResult,
    ].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const assignments = assignmentResult.data ?? [];
    const profileIds = Array.from(new Set(assignments.map((assignment) => assignment.user_id)));
    const nodeIds = Array.from(new Set(
      (mappingResult.data ?? []).map((mapping) => mapping.timeline_node_id)
    ));
    const [{ data: profiles, error: profileError }, { data: checklistItems, error: checklistError }] =
      await Promise.all([
        profileIds.length
          ? supabase
            .from("profiles")
            .select("id,display_name,ministry_group")
            .in("id", profileIds)
          : Promise.resolve({ data: [], error: null }),
        nodeIds.length
          ? supabase
            .from("checklist_items")
            .select("id,node_id,is_active")
            .in("node_id", nodeIds)
            .eq("is_active", true)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (profileError || checklistError) throw profileError || checklistError;

    const dashboard = deriveLiveServiceStatus({
      actorUserId: actor.userId,
      scope: actor.scope,
      service,
      assignments,
      stations: stationResult.data ?? [],
      profiles: profiles ?? [],
      checkIns: checkInResult.data ?? [],
      confirmations: confirmationResult.data ?? [],
      taskMappings: mappingResult.data ?? [],
      checklistItems: checklistItems ?? [],
      checklistStates: checklistStateResult.data ?? [],
    });

    return response({
      services,
      service,
      scope: actor.scope,
      ...dashboard,
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return response({ error: authError.message }, authError.status);
  }
}
