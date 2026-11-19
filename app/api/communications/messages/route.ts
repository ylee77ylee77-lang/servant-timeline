import { NextRequest, NextResponse } from "next/server";
import { communicationErrorResponse, getCommunicationPeer, requireCommunicationActor } from "@/lib/communications/access";
import { broadcastCommunicationMessage } from "@/lib/communications/broadcast";
import { COMMUNICATION_BUCKET } from "@/lib/communications/storage";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function serializeMessages(rows: Array<Record<string, unknown>>) {
  const supabase = getSupabaseAdminClient();
  return Promise.all(rows.map(async (row) => {
    let attachmentUrl = "";
    const path = row.retracted_at ? "" : String(row.attachment_path || "");
    if (path) {
      const { data } = await supabase.storage
        .from(COMMUNICATION_BUCKET)
        .createSignedUrl(path, 60 * 60);
      attachmentUrl = data?.signedUrl || "";
    }

    return {
      id: String(row.id),
      senderId: String(row.sender_id),
      recipientId: String(row.recipient_id),
      messageType: String(row.message_type),
      body: row.retracted_at ? "" : String(row.body || ""),
      attachmentName: row.retracted_at ? "" : String(row.attachment_name || ""),
      attachmentMime: row.retracted_at ? "" : String(row.attachment_mime || ""),
      attachmentSize: row.retracted_at ? 0 : Number(row.attachment_size || 0),
      attachmentUrl,
      editedAt: row.edited_at ? String(row.edited_at) : null,
      retractedAt: row.retracted_at ? String(row.retracted_at) : null,
      readAt: row.read_at ? String(row.read_at) : null,
      createdAt: String(row.created_at),
    };
  }));
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const peerId = String(request.nextUrl.searchParams.get("peerId") || "");
    await getCommunicationPeer(actor, peerId);

    const { data, error } = await getSupabaseAdminClient()
      .from("communication_messages")
      .select("id,sender_id,recipient_id,message_type,body,attachment_path,attachment_name,attachment_mime,attachment_size,edited_at,retracted_at,read_at,created_at")
      .or(`and(sender_id.eq.${actor.userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${actor.userId})`)
      .order("created_at", { ascending: true })
      .limit(250);
    if (error) throw error;

    return NextResponse.json({ messages: await serializeMessages((data ?? []) as Array<Record<string, unknown>>) });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const body = await request.json().catch(() => ({}));
    const peerId = String(body.peerId || "");
    const text = String(body.body || "").normalize("NFKC").trim();
    await getCommunicationPeer(actor, peerId);

    if (!text || text.length > 4000) {
      return NextResponse.json({ error: "訊息需為 1–4000 字元。" }, { status: 400 });
    }

    const { data, error } = await getSupabaseAdminClient()
      .from("communication_messages")
      .insert({
        sender_id: actor.userId,
        recipient_id: peerId,
        message_type: "text",
        body: text,
      })
      .select("id,sender_id,recipient_id,message_type,body,attachment_path,attachment_name,attachment_mime,attachment_size,edited_at,retracted_at,read_at,created_at")
      .single();
    if (error) throw error;

    const message = (await serializeMessages([data]))[0];
    await broadcastCommunicationMessage(data as unknown as Record<string, unknown>);

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireCommunicationActor(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const supabase = getSupabaseAdminClient();

    if (action === "read") {
      const peerId = String(body.peerId || "");
      await getCommunicationPeer(actor, peerId);
      const { error } = await supabase
        .from("communication_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_id", peerId)
        .eq("recipient_id", actor.userId)
        .is("read_at", null)
        .is("retracted_at", null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const messageId = String(body.messageId || "");
    const { data: existing, error: existingError } = await supabase
      .from("communication_messages")
      .select("id,sender_id,recipient_id,message_type,attachment_path,retracted_at")
      .eq("id", messageId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || String(existing.sender_id) !== actor.userId) {
      return NextResponse.json({ error: "只能修改或收回自己送出的訊息。" }, { status: 403 });
    }

    await getCommunicationPeer(actor, String(existing.recipient_id));

    if (existing.retracted_at) {
      return NextResponse.json({ error: "這則訊息已經收回。" }, { status: 409 });
    }

    if (action === "edit") {
      if (existing.message_type !== "text") {
        return NextResponse.json({ error: "目前只有文字訊息可以編輯。" }, { status: 400 });
      }
      const text = String(body.body || "").normalize("NFKC").trim();
      if (!text || text.length > 4000) {
        return NextResponse.json({ error: "訊息需為 1–4000 字元。" }, { status: 400 });
      }
      const { error } = await supabase
        .from("communication_messages")
        .update({ body: text, edited_at: new Date().toISOString() })
        .eq("id", messageId)
        .eq("sender_id", actor.userId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "retract") {
      const attachmentPath = String(existing.attachment_path || "");
      const { error } = await supabase
        .from("communication_messages")
        .update({
          body: null,
          attachment_path: null,
          attachment_name: null,
          attachment_mime: null,
          attachment_size: null,
          retracted_at: new Date().toISOString(),
        })
        .eq("id", messageId)
        .eq("sender_id", actor.userId);
      if (error) throw error;

      if (attachmentPath) {
        await supabase.storage.from(COMMUNICATION_BUCKET).remove([attachmentPath]).catch(() => undefined);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "不支援的訊息操作。" }, { status: 400 });
  } catch (error) {
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
