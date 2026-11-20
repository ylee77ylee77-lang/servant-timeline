import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { broadcastCommunicationMessage } from "@/lib/communications/broadcast";
import { communicationErrorResponse, getCommunicationPeer, requireCommunicationActor } from "@/lib/communications/access";
import {
  COMMUNICATION_BUCKET,
  ensureCommunicationBucket,
  isAllowedCommunicationFile,
  isImageCommunicationFile,
  sanitizeAttachmentName,
} from "@/lib/communications/storage";
import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { baseMediaMime, isVoiceMime, matchesVoiceSignature } from "@/lib/communications/media-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let uploadedPath = "";
  try {
    const actor = await requireCommunicationActor(request);
    const form = await request.formData();
    const peerId = String(form.get("peerId") || "");
    const file = form.get("file");
    await getCommunicationPeer(actor, peerId);

    if (!(file instanceof File) || !isAllowedCommunicationFile(file)) {
      return NextResponse.json(
        { error: "只接受圖片、語音留言、PDF、Office 或文字檔；語音最多 4MB，其他檔案最多 10MB。" },
        { status: 400 }
      );
    }

    await ensureCommunicationBucket();
    const safeName = sanitizeAttachmentName(file.name);
    uploadedPath = `${actor.userId}/${peerId}/${randomUUID()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = baseMediaMime(file.type);
    if (isVoiceMime(mime) && !matchesVoiceSignature(bytes, mime)) {
      return NextResponse.json({ error: "語音檔案格式不正確，請重新錄製。" }, { status: 400 });
    }
    const supabase = getSupabaseAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(COMMUNICATION_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: mime,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: message, error: insertError } = await supabase
      .from("communication_messages")
      .insert({
        sender_id: actor.userId,
        recipient_id: peerId,
        message_type: isImageCommunicationFile(file) ? "image" : "file",
        attachment_path: uploadedPath,
        attachment_name: safeName,
        attachment_mime: mime,
        attachment_size: file.size,
      })
      .select("id,sender_id,recipient_id,message_type,body,attachment_name,attachment_mime,attachment_size,edited_at,retracted_at,read_at,created_at")
      .single();
    if (insertError) throw insertError;

    after(async () => {
      if (!await broadcastCommunicationMessage(message as unknown as Record<string, unknown>)) {
        console.warn("Communication Broadcast unavailable; database fallback remains enabled.");
      }
    });

    return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 });
  } catch (error) {
    if (uploadedPath) {
      await getSupabaseAdminClient().storage
        .from(COMMUNICATION_BUCKET)
        .remove([uploadedPath])
        .catch(() => undefined);
    }
    const resolved = communicationErrorResponse(error);
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
