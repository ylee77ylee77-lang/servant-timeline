import { NextRequest, NextResponse } from "next/server";
import { communicationErrorResponse, getCommunicationPeer, requireCommunicationActor } from "@/lib/communications/access";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadCallForActor(callId: string, actorId: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from("communication_calls")
    .select("id,caller_id,callee_id,status,answered_at,ended_at,created_at")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (String(data.caller_id) !== actorId && String(data.callee_id) !== actorId)) {
    throw Object.assign(new Error("找不到可操作的通話。"), { status: 404 });
  }
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const callId = String(request.nextUrl.searchParams.get("callId") || "");
    const supabase = getSupabaseAdminClient();

    if (callId) {
      const call = await loadCallForActor(callId, actor.userId);
      const peerId = String(call.caller_id) === actor.userId ? String(call.callee_id) : String(call.caller_id);
      await getCommunicationPeer(actor, peerId);

      const { data: signals, error } = await supabase
        .from("communication_call_signals")
        .select("id,call_id,sender_id,signal_type,payload,created_at")
        .eq("call_id", callId)
        .order("id", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ call, signals: signals ?? [] });
    }

    const { data, error } = await supabase
      .from("communication_calls")
      .select("id,caller_id,callee_id,status,answered_at,ended_at,created_at")
      .or(`caller_id.eq.${actor.userId},callee_id.eq.${actor.userId}`)
      .in("status", ["ringing", "accepted"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return NextResponse.json({ calls: data ?? [] });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const supabase = getSupabaseAdminClient();

    if (action === "start") {
      const peerId = String(body.peerId || "");
      await getCommunicationPeer(actor, peerId);

      const { data: existing, error: existingError } = await supabase
        .from("communication_calls")
        .select("id")
        .or(`and(caller_id.eq.${actor.userId},callee_id.eq.${peerId}),and(caller_id.eq.${peerId},callee_id.eq.${actor.userId})`)
        .in("status", ["ringing", "accepted"])
        .limit(1);
      if (existingError) throw existingError;
      if ((existing ?? []).length) {
        return NextResponse.json({ error: "目前已有進行中的通話。" }, { status: 409 });
      }

      const { data, error } = await supabase
        .from("communication_calls")
        .insert({ caller_id: actor.userId, callee_id: peerId, status: "ringing" })
        .select("id,caller_id,callee_id,status,answered_at,ended_at,created_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ call: data }, { status: 201 });
    }

    const callId = String(body.callId || "");
    const call = await loadCallForActor(callId, actor.userId);
    const peerId = String(call.caller_id) === actor.userId ? String(call.callee_id) : String(call.caller_id);
    await getCommunicationPeer(actor, peerId);

    if (action === "accept") {
      if (String(call.callee_id) !== actor.userId || call.status !== "ringing") {
        return NextResponse.json({ error: "目前無法接聽這通電話。" }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("communication_calls")
        .update({ status: "accepted", answered_at: new Date().toISOString() })
        .eq("id", callId)
        .eq("callee_id", actor.userId)
        .eq("status", "ringing")
        .select("id,caller_id,callee_id,status,answered_at,ended_at,created_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ call: data });
    }

    if (action === "decline") {
      if (String(call.callee_id) !== actor.userId || call.status !== "ringing") {
        return NextResponse.json({ error: "目前無法拒接這通電話。" }, { status: 409 });
      }
      const { error } = await supabase
        .from("communication_calls")
        .update({ status: "declined", ended_at: new Date().toISOString() })
        .eq("id", callId)
        .eq("callee_id", actor.userId)
        .eq("status", "ringing");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "end") {
      const nextStatus = call.status === "ringing" && String(call.caller_id) === actor.userId ? "missed" : "ended";
      const { error } = await supabase
        .from("communication_calls")
        .update({ status: nextStatus, ended_at: new Date().toISOString() })
        .eq("id", callId)
        .in("status", ["ringing", "accepted"]);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "signal") {
      if (!["ringing", "accepted"].includes(String(call.status))) {
        return NextResponse.json({ error: "通話已結束。" }, { status: 409 });
      }
      const signalType = String(body.signalType || "");
      const payload = body.payload;
      if (!["offer", "answer", "ice"].includes(signalType) || !payload || typeof payload !== "object" || Array.isArray(payload)) {
        return NextResponse.json({ error: "通話訊號格式無效。" }, { status: 400 });
      }
      const { data, error } = await supabase
        .from("communication_call_signals")
        .insert({
          call_id: callId,
          sender_id: actor.userId,
          signal_type: signalType,
          payload,
        })
        .select("id,call_id,sender_id,signal_type,payload,created_at")
        .single();
      if (error) throw error;
      return NextResponse.json({ signal: data }, { status: 201 });
    }

    return NextResponse.json({ error: "不支援的通話操作。" }, { status: 400 });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
