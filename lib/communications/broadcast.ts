import "server-only";

import { deriveCommunicationBroadcastTopic } from "@/lib/communications/broadcast-topic";

const BROADCAST_TIMEOUT_MS = 1500;

function getBroadcastSecret() {
  const secret = String(process.env.COMMUNICATION_BROADCAST_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new Error("Communication Broadcast secret is not configured.");
  }
  return secret;
}

export function getCommunicationBroadcastTopic(userId: string) {
  return deriveCommunicationBroadcastTopic(userId, getBroadcastSecret());
}

export async function broadcastCommunicationMessage(row: Record<string, unknown>) {
  const supabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ""
  ).trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const recipientId = String(row.recipient_id ?? "").trim();

  if (!supabaseUrl || !serviceRoleKey || !recipientId) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: getCommunicationBroadcastTopic(recipientId),
            event: "message-insert",
            payload: {
              id: row.id,
              sender_id: row.sender_id,
              recipient_id: row.recipient_id,
              message_type: row.message_type,
              body: row.body,
              attachment_name: row.attachment_name,
              attachment_mime: row.attachment_mime,
              attachment_size: row.attachment_size,
              edited_at: row.edited_at,
              retracted_at: row.retracted_at,
              read_at: row.read_at,
              created_at: row.created_at,
            },
          },
        ],
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
