import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireAdmin, requireCoordinatorForService } from "@/lib/auth/require-admin";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ serviceId: string }> };

async function serviceIdFrom(context: Context) {
  const { serviceId } = await context.params;
  if (!UUID_PATTERN.test(serviceId)) throw Object.assign(new Error("場次識別資料無效。"), { status: 400 });
  return serviceId;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const serviceId = await serviceIdFrom(context);
    const actor = await requireCoordinatorForService(request, serviceId);
    const supabase = getSupabaseUserClient(request);
    const { data: service, error: serviceError } = await supabase
      .from("worship_services")
      .select("id,service_date,service_type,starts_at,report_at,location,status,notes")
      .eq("id", serviceId)
      .maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: "找不到場次。" }, { status: 404 });

    const { data: rows, error: nodeError } = await supabase
      .from("timeline_nodes")
      .select("id,service_id,source_template_node_id,time,title,assignee,location,details,service_type,sort_order")
      .or(`service_id.eq.${serviceId},and(service_id.is.null,service_type.eq.${service.service_type})`)
      .order("sort_order")
      .order("time")
      .order("id");
    if (nodeError) throw nodeError;

    const snapshots = new Set((rows ?? []).filter((row) => row.service_id === serviceId).map((row) => row.source_template_node_id).filter(Boolean));
    const tasks = (rows ?? []).filter((row) => row.service_id === serviceId || !snapshots.has(row.id)).map((row) => ({
      ...row,
      scope: row.service_id === serviceId ? "service" : "template",
    }));
    return NextResponse.json({ service, tasks, canEdit: actor.roles.includes("admin") });
  } catch (error) {
    const auth = getAuthErrorResponse(error);
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const serviceId = await serviceIdFrom(context);
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const sourceNodeId = String(body.id ?? "").trim();
    const time = String(body.time ?? "").trim();
    const title = String(body.title ?? "").normalize("NFKC").trim();
    const assignee = String(body.assignee ?? "").normalize("NFKC").trim();
    const location = String(body.location ?? "").normalize("NFKC").trim();
    const details = String(body.details ?? "").trim();
    const sortOrder = Number(body.sort_order ?? 0);
    if (!sourceNodeId || sourceNodeId.length > 160 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !title || title.length > 200 || assignee.length > 100 || location.length > 120 || details.length > 2000 || !Number.isInteger(sortOrder)) {
      return NextResponse.json({ error: "任務資料無效。" }, { status: 400 });
    }

    const supabase = getSupabaseUserClient(request);
    const { data: service, error: serviceError } = await supabase.from("worship_services").select("service_type").eq("id", serviceId).maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return NextResponse.json({ error: "找不到場次。" }, { status: 404 });

    const { data: source, error: sourceError } = await supabase.from("timeline_nodes").select("id,service_id,service_type").eq("id", sourceNodeId).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || (source.service_id && source.service_id !== serviceId) || (!source.service_id && source.service_type !== service.service_type)) {
      return NextResponse.json({ error: "任務不屬於此場次。" }, { status: 400 });
    }

    let targetId = source.id;
    if (!source.service_id) {
      const { data: existing, error: existingError } = await supabase.from("timeline_nodes").select("id").eq("service_id", serviceId).eq("source_template_node_id", source.id).maybeSingle();
      if (existingError) throw existingError;
      targetId = existing?.id ?? randomUUID();
      if (!existing) {
        const { error: insertError } = await supabase.from("timeline_nodes").insert({ id: targetId, service_id: serviceId, source_template_node_id: source.id, service_type: service.service_type, time, title, assignee: assignee || null, location: location || null, details: details || null, sort_order: sortOrder });
        if (insertError) throw insertError;
        const { data: checklist, error: checklistError } = await supabase.from("checklist_items").select("text,details,sort_order").eq("node_id", source.id).order("sort_order");
        if (checklistError) throw checklistError;
        if (checklist?.length) {
          const { error: copyError } = await supabase.from("checklist_items").insert(checklist.map((item) => ({ id: randomUUID(), node_id: targetId, text: item.text, details: item.details, sort_order: item.sort_order, is_completed: false, completed_at: null })));
          if (copyError) throw copyError;
        }
        const { error: mappingError } = await supabase.from("service_task_assignments").update({ timeline_node_id: targetId, created_by: admin.userId }).eq("service_id", serviceId).eq("timeline_node_id", source.id);
        if (mappingError) throw mappingError;
      }
    }

    const { data, error } = await supabase.from("timeline_nodes").update({ time, title, assignee: assignee || null, location: location || null, details: details || null, sort_order: sortOrder }).eq("id", targetId).eq("service_id", serviceId).select("id,service_id,source_template_node_id,time,title,assignee,location,details,service_type,sort_order").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "找不到可更新的本堂任務。" }, { status: 404 });
    return NextResponse.json({ task: { ...data, scope: "service" }, message: "已儲存本堂修改，不影響其他堂次或範本。" });
  } catch (error) {
    const auth = getAuthErrorResponse(error);
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
}
