import { NextRequest, NextResponse } from "next/server";
import { getAuthErrorResponse, requireCoordinator } from "@/lib/auth/require-admin";
import { SERVICE_TYPES } from "@/lib/services/catalog";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only common timelines for the current coordinator-only rollout.
// This endpoint never returns assignments, private check-in records or user data.
export async function GET(request: NextRequest) {
  try {
    await requireCoordinator(request);
    const supabase = getSupabaseAdminClient();
    const { data: nodes, error: nodeError } = await supabase
      .from("timeline_nodes")
      .select("id,service_type,time,title,assignee,location,details,sort_order")
      .is("service_id", null)
      .eq("is_active", true)
      .in("service_type", [...SERVICE_TYPES])
      .order("sort_order", { ascending: true })
      .order("time", { ascending: true });
    if (nodeError) throw nodeError;

    const nodeIds = (nodes ?? []).map((node) => node.id);
    if (!nodeIds.length) return NextResponse.json({ nodes: [] });

    const { data: items, error: itemError } = await supabase
      .from("checklist_items")
      .select("id,node_id,text,details,sort_order")
      .in("node_id", nodeIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (itemError) throw itemError;

    const checklists = new Map<string, Array<{
      id: string; text: string; details: string | null; is_completed: boolean;
    }>>();
    for (const item of items ?? []) {
      const list = checklists.get(item.node_id) ?? [];
      list.push({
        id: item.id,
        text: item.text,
        details: item.details,
        is_completed: false,
      });
      checklists.set(item.node_id, list);
    }

    return NextResponse.json({
      nodes: (nodes ?? []).map((node) => ({
        ...node,
        checklist: checklists.get(node.id) ?? [],
      })),
    });
  } catch (error) {
    const authError = getAuthErrorResponse(error);
    return NextResponse.json({ error: authError.message }, { status: authError.status });
  }
}
