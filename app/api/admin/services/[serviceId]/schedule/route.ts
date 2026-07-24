import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin, requireCoordinatorForService } from "@/lib/auth/require-admin";
import { isServiceType, SERVICE_DAY_BY_TYPE } from "@/lib/services/catalog";
import { getSupabaseUserClient } from "@/lib/supabase/server-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EDITABLE_STATUSES = new Set(["draft", "published", "cancelled"]);
type Context = { params: Promise<{ serviceId: string }> };

type AppError = Error & { status?: number; code?: string };

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function routeError(error: unknown) {
  const appError = error as AppError;
  let status = Number(appError?.status) || 500;
  let message = status < 500 && error instanceof Error
    ? error.message
    : "伺服器無法完成排程操作。";

  if (appError?.code === "P0002") {
    status = 404;
    message = "找不到場次或任務。";
  } else if (appError?.code === "23505") {
    status = 409;
    message = "資料已存在，請重新載入後再試。";
  } else if (appError?.code === "23514") {
    status = 409;
    message = "此操作不符合場次狀態或已有執行紀錄。";
  } else if (appError?.code === "42501") {
    status = 403;
    message = "你沒有執行此操作的權限。";
  }

  return NextResponse.json({ error: message }, { status });
}

async function serviceIdFrom(context: Context) {
  const { serviceId } = await context.params;
  if (!UUID_PATTERN.test(serviceId)) fail("場次識別資料無效。");
  return serviceId;
}

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime())
    && new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date) === value;
}

function cleanText(value: unknown, maxLength: number) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (text.length > maxLength) fail(`文字長度不得超過 ${maxLength} 字。`);
  return text;
}

function optionalNodeId(value: unknown) {
  const id = String(value ?? "").trim();
  if (id && id.length > 160) fail("任務識別資料無效。");
  return id;
}

async function fetchService(supabase: SupabaseClient, serviceId: string) {
  const { data, error } = await supabase
    .from("worship_services")
    .select("id,service_date,service_type,starts_at,report_at,location,status,notes")
    .eq("id", serviceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("找不到場次。", 404);
  return data;
}

async function ensureEditableService(supabase: SupabaseClient, serviceId: string) {
  const service = await fetchService(supabase, serviceId);
  if (service.status === "completed") fail("已完成的場次不能再修改。", 409);
  return service;
}

async function ensureServiceTaskSnapshot(
  supabase: SupabaseClient,
  serviceId: string,
  sourceNodeId: string
) {
  const { data, error } = await supabase.rpc("ensure_service_task_snapshot", {
    p_service_id: serviceId,
    p_source_node_id: sourceNodeId,
  });
  if (error) throw error;
  const targetId = String(data ?? "");
  if (!targetId || targetId.length > 160) {
    throw new Error("Snapshot RPC returned an invalid timeline node id");
  }
  return targetId;
}

async function resolveChecklistTarget(
  supabase: SupabaseClient,
  targetNodeId: string,
  sourceItemId: string
) {
  const { data: direct, error: directError } = await supabase
    .from("checklist_items")
    .select("id,node_id")
    .eq("id", sourceItemId)
    .maybeSingle();
  if (directError) throw directError;
  if (direct?.node_id === targetNodeId) return String(direct.id);

  const { data: snapshot, error: snapshotError } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("node_id", targetNodeId)
    .eq("source_template_item_id", sourceItemId)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot?.id) fail("清單項目不屬於此任務。");
  return String(snapshot.id);
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const serviceId = await serviceIdFrom(context);
    const actor = await requireCoordinatorForService(request, serviceId);
    const supabase = getSupabaseUserClient(request);
    const service = await fetchService(supabase, serviceId);

    const [{ data: rows, error: nodeError }, { data: requiredItems, error: requiredError }] =
      await Promise.all([
        supabase
          .from("timeline_nodes")
          .select("id,service_id,source_template_node_id,time,title,assignee,location,details,service_type,voice_reminder_enabled,reminder_pre5_enabled,reminder_now_enabled,sort_order,is_active")
          .or(`service_id.eq.${serviceId},and(service_id.is.null,service_type.eq.${service.service_type})`)
          .order("sort_order")
          .order("time")
          .order("id"),
        supabase
          .from("service_required_items")
          .select("id,name,details,quantity,sort_order,is_active")
          .eq("service_id", serviceId)
          .order("sort_order")
          .order("name"),
      ]);
    if (nodeError || requiredError) throw nodeError || requiredError;

    const scopedRows = (rows ?? []).filter((row) => row.service_id === serviceId);
    const shadowedTemplateIds = new Set(
      scopedRows.map((row) => row.source_template_node_id).filter(Boolean)
    );
    const resolvedRows = (rows ?? []).filter((row) => (
      row.service_id === serviceId
        ? row.is_active
        : row.is_active && !shadowedTemplateIds.has(row.id)
    ));
    const taskIds = resolvedRows.map((row) => String(row.id));
    const { data: checklist, error: checklistError } = taskIds.length
      ? await supabase
        .from("checklist_items")
        .select("id,node_id,source_template_item_id,text,details,sort_order,is_active")
        .in("node_id", taskIds)
        .eq("is_active", true)
        .order("sort_order")
        .order("id")
      : { data: [], error: null };
    if (checklistError) throw checklistError;

    const tasks = resolvedRows.map((row) => ({
      ...row,
      scope: row.service_id === serviceId ? "service" : "template",
      checklist: (checklist ?? []).filter((item) => item.node_id === row.id),
    }));

    return NextResponse.json({
      service,
      tasks,
      requiredItems: (requiredItems ?? []).filter((item) => item.is_active),
      canEdit: actor.roles.includes("admin") && service.status !== "completed",
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const serviceId = await serviceIdFrom(context);
    const admin = await requireAdmin(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const supabase = getSupabaseUserClient(request);
    const service = await ensureEditableService(supabase, serviceId);

    if (action === "update_service") {
      const serviceDate = String(body.serviceDate ?? "").trim();
      const startsAt = String(body.startsAt ?? "").trim();
      const reportAt = String(body.reportAt ?? "").trim();
      const location = cleanText(body.location, 120);
      const notes = cleanText(body.notes, 2000);
      const status = String(body.status ?? "draft");
      if (!isRealDate(serviceDate) || !TIME_PATTERN.test(startsAt) || !TIME_PATTERN.test(reportAt)) {
        fail("日期、報到時間或開始時間格式無效。");
      }
      if (!isServiceType(service.service_type)) fail("堂次資料無效。");
      const serviceDay = new Date(`${serviceDate}T12:00:00+08:00`).getUTCDay();
      if (serviceDay !== SERVICE_DAY_BY_TYPE[service.service_type]) {
        fail(`${service.service_type} 不符合所選日期的星期。`);
      }
      if (!location) fail("請填寫報到地點。");
      if (!EDITABLE_STATUSES.has(status)) fail("場次狀態無效。");
      const startsAtIso = `${serviceDate}T${startsAt}:00+08:00`;
      const reportAtIso = `${serviceDate}T${reportAt}:00+08:00`;
      if (new Date(reportAtIso).getTime() > new Date(startsAtIso).getTime()) {
        fail("報到時間不得晚於崇拜開始時間。");
      }

      const dateChanged = serviceDate !== service.service_date;
      if (dateChanged || status === "cancelled") {
        const { data: checkIns, error: checkInError } = await supabase
          .from("service_check_ins")
          .select("id")
          .eq("service_id", serviceId)
          .limit(1);
        if (checkInError) throw checkInError;
        if (checkIns?.length) fail("此場次已有報到紀錄，不能更改日期或取消。", 409);
      }

      const { data, error } = await supabase
        .from("worship_services")
        .update({
          service_date: serviceDate,
          starts_at: startsAtIso,
          report_at: reportAtIso,
          location,
          notes: notes || null,
          status,
          updated_by: admin.userId,
        })
        .eq("id", serviceId)
        .select("id,service_date,service_type,starts_at,report_at,location,status,notes")
        .maybeSingle();
      if (error?.code === "23505") fail("同一天已有相同堂次。", 409);
      if (error) throw error;
      if (!data) fail("找不到可更新的場次。", 404);
      return NextResponse.json({ service: data, message: "已儲存本堂基本資料。" });
    }

    if (action === "save_task") {
      const sourceNodeId = optionalNodeId(body.id);
      const taskTime = String(body.time ?? "").trim();
      const title = cleanText(body.title, 200);
      const assignee = cleanText(body.assignee, 100);
      const location = cleanText(body.location, 120);
      const details = cleanText(body.details, 2000);
      const sortOrder = Number(body.sort_order ?? 0);
      if (!TIME_PATTERN.test(taskTime) || !title || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        fail("任務時間、名稱或排序無效。");
      }
      const payload = {
        time: taskTime,
        title,
        assignee: assignee || null,
        location: location || null,
        details: details || null,
        voice_reminder_enabled: body.voice_reminder_enabled !== false,
        reminder_pre5_enabled: body.reminder_pre5_enabled !== false,
        reminder_now_enabled: body.reminder_now_enabled !== false,
        sort_order: sortOrder,
        is_active: true,
      };

      if (!sourceNodeId) {
        const { data, error } = await supabase
          .from("timeline_nodes")
          .insert({
            id: randomUUID(),
            service_id: serviceId,
            source_template_node_id: null,
            service_type: service.service_type,
            ...payload,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ task: data, message: "已新增本堂任務。" }, { status: 201 });
      }

      const targetId = await ensureServiceTaskSnapshot(supabase, serviceId, sourceNodeId);
      const { data, error } = await supabase
        .from("timeline_nodes")
        .update(payload)
        .eq("id", targetId)
        .eq("service_id", serviceId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) fail("找不到可更新的本堂任務。", 404);
      return NextResponse.json({ task: data, message: "已儲存本堂修改，不影響其他堂次或範本。" });
    }

    if (action === "delete_task") {
      const sourceNodeId = optionalNodeId(body.id);
      if (!sourceNodeId) fail("任務識別資料無效。");
      const targetId = await ensureServiceTaskSnapshot(supabase, serviceId, sourceNodeId);
      const { error } = await supabase
        .from("timeline_nodes")
        .update({ is_active: false })
        .eq("id", targetId)
        .eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ message: "已從本堂停用此任務，歷史紀錄仍保留。" });
    }

    if (action === "save_checklist") {
      const taskId = optionalNodeId(body.taskId);
      const sourceItemId = optionalNodeId(body.id);
      const text = cleanText(body.text, 300);
      const details = cleanText(body.details, 1000);
      const sortOrder = Number(body.sort_order ?? 0);
      if (!taskId || !text || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        fail("清單項目資料無效。");
      }
      const targetNodeId = await ensureServiceTaskSnapshot(supabase, serviceId, taskId);
      if (!sourceItemId) {
        const { data, error } = await supabase
          .from("checklist_items")
          .insert({
            id: randomUUID(),
            node_id: targetNodeId,
            source_template_item_id: null,
            text,
            details: details || null,
            sort_order: sortOrder,
            is_active: true,
            is_completed: false,
            completed_at: null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ checklistItem: data, message: "已新增本堂清單項目。" }, { status: 201 });
      }
      const targetItemId = await resolveChecklistTarget(supabase, targetNodeId, sourceItemId);
      const { data, error } = await supabase
        .from("checklist_items")
        .update({ text, details: details || null, sort_order: sortOrder, is_active: true })
        .eq("id", targetItemId)
        .eq("node_id", targetNodeId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) fail("找不到可更新的清單項目。", 404);
      return NextResponse.json({ checklistItem: data, message: "已儲存本堂清單修改。" });
    }

    if (action === "delete_checklist") {
      const taskId = optionalNodeId(body.taskId);
      const sourceItemId = optionalNodeId(body.id);
      if (!taskId || !sourceItemId) fail("清單識別資料無效。");
      const targetNodeId = await ensureServiceTaskSnapshot(supabase, serviceId, taskId);
      const targetItemId = await resolveChecklistTarget(supabase, targetNodeId, sourceItemId);
      const { error } = await supabase
        .from("checklist_items")
        .update({ is_active: false })
        .eq("id", targetItemId)
        .eq("node_id", targetNodeId);
      if (error) throw error;
      return NextResponse.json({ message: "已從本堂停用此清單項目。" });
    }

    if (action === "save_required_item") {
      const id = String(body.id ?? "").trim();
      const name = cleanText(body.name, 120);
      const details = cleanText(body.details, 1000);
      const quantity = Number(body.quantity ?? 1);
      const sortOrder = Number(body.sort_order ?? 0);
      if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 999 || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        fail("必備物品資料無效。");
      }
      if (id && !UUID_PATTERN.test(id)) fail("必備物品識別資料無效。");
      const payload = {
        service_id: serviceId,
        name,
        details: details || null,
        quantity,
        sort_order: sortOrder,
        is_active: true,
        updated_by: admin.userId,
      };
      const query = id
        ? supabase.from("service_required_items").update(payload).eq("id", id).eq("service_id", serviceId)
        : supabase.from("service_required_items").insert({ ...payload, created_by: admin.userId });
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) fail("找不到可更新的必備物品。", 404);
      return NextResponse.json({
        requiredItem: data,
        message: id ? "已更新必備物品。" : "已新增必備物品。",
      }, { status: id ? 200 : 201 });
    }

    if (action === "delete_required_item") {
      const id = String(body.id ?? "").trim();
      if (!UUID_PATTERN.test(id)) fail("必備物品識別資料無效。");
      const { error } = await supabase
        .from("service_required_items")
        .update({ is_active: false, updated_by: admin.userId })
        .eq("id", id)
        .eq("service_id", serviceId);
      if (error) throw error;
      return NextResponse.json({ message: "已停用本堂必備物品。" });
    }

    fail("不支援的排程操作。");
  } catch (error) {
    return routeError(error);
  }
}
