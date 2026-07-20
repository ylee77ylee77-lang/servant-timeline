import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireActiveUser } from "@/lib/auth/require-admin";
import { isServiceType } from "@/lib/services/catalog";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function taipeiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function taipeiTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireActiveUser(request);
    const requestedServiceType = request.nextUrl.searchParams.get("serviceType")?.trim() ?? "";
    if (requestedServiceType && !isServiceType(requestedServiceType)) {
      return NextResponse.json({ error: "堂次無效。" }, { status: 400 });
    }

    const supabase = getSupabaseUserClient(request);
    const { data: assignments, error: assignmentError } = await supabase
      .from("service_assignments")
      .select("id,service_id,station_id,role_label,report_at,report_location,status")
      .eq("user_id", user.userId)
      .in("status", ["scheduled", "confirmed", "completed"]);
    if (assignmentError) throw assignmentError;
    if (!assignments?.length) {
      return NextResponse.json({ assignment: null, service: null, nodes: [] });
    }

    const { data: services, error: serviceError } = await supabase
      .from("worship_services")
      .select("id,service_date,service_type,starts_at,report_at,location,status")
      .in("id", assignments.map((assignment) => assignment.service_id))
      .in("status", ["published", "completed"])
      .order("service_date", { ascending: true })
      .order("starts_at", { ascending: true });
    if (serviceError) throw serviceError;

    const today = taipeiDateKey();
    const requestedCandidates = (services ?? []).filter(
      (service) => !requestedServiceType || service.service_type === requestedServiceType
    );
    const candidates = requestedCandidates.length ? requestedCandidates : (services ?? []);
    const service =
      candidates.find((item) => item.service_date === today && item.status === "published")
      ?? candidates.find((item) => item.service_date >= today && item.status === "published")
      ?? [...candidates].reverse().find((item) => item.status === "completed")
      ?? null;

    if (!service) {
      return NextResponse.json({ assignment: null, service: null, nodes: [] });
    }

    const assignment = assignments.find((item) => item.service_id === service.id) ?? null;
    if (!assignment) {
      return NextResponse.json({ assignment: null, service: null, nodes: [] });
    }

    let assignedStation = "";
    if (assignment.station_id) {
      const { data: station, error: stationError } = await supabase
        .from("service_stations")
        .select("name")
        .eq("id", assignment.station_id)
        .eq("service_id", service.id)
        .maybeSingle();
      if (stationError) throw stationError;
      assignedStation = String(station?.name ?? "");
    }

    const { data: taskMappings, error: mappingError } = await supabase
      .from("service_task_assignments")
      .select("timeline_node_id")
      .eq("service_id", service.id)
      .eq("assignment_id", assignment.id);
    if (mappingError) throw mappingError;

    const nodeIds = (taskMappings ?? []).map((mapping) => mapping.timeline_node_id);
    if (!nodeIds.length) {
      return NextResponse.json({
        assignment,
        service,
        assignedStation,
        nodes: [],
      });
    }

    const [{ data: nodes, error: nodeError }, { data: checklist, error: checklistError }, { data: states, error: stateError }] =
      await Promise.all([
        supabase.from("timeline_nodes").select("*").in("id", nodeIds).order("time", { ascending: true }),
        supabase.from("checklist_items").select("*").in("node_id", nodeIds).order("sort_order", { ascending: true }).order("id", { ascending: true }),
        supabase.from("assignment_checklist_states").select("checklist_item_id,is_completed,completed_at").eq("service_id", service.id).eq("assignment_id", assignment.id),
      ]);
    if (nodeError || checklistError || stateError) throw nodeError || checklistError || stateError;

    const stateByItem = new Map((states ?? []).map((state) => [state.checklist_item_id, state]));
    const formattedNodes = (nodes ?? []).map((node) => ({
      ...node,
      service_type: service.service_type,
      assignment_id: assignment.id,
      checklist: (checklist ?? [])
        .filter((item) => item.node_id === node.id)
        .map((item) => {
          const state = stateByItem.get(item.id);
          return {
            ...item,
            is_completed: state?.is_completed ?? false,
            completed_at: taipeiTime(state?.completed_at ?? null),
          };
        }),
    }));

    return NextResponse.json({ assignment, service, assignedStation, nodes: formattedNodes });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
