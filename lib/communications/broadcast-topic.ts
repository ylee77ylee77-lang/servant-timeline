import { createHmac } from "node:crypto";

export function deriveCommunicationBroadcastTopic(userId: string, secret: string) {
  const normalizedUserId = String(userId || "").trim().toLowerCase();
  const normalizedSecret = String(secret || "").trim();
  if (!/^[0-9a-f-]{36}$/.test(normalizedUserId)) {
    throw new Error("Invalid communication user ID.");
  }
  if (normalizedSecret.length < 32) {
    throw new Error("Communication Broadcast secret is not configured.");
  }

  const digest = createHmac("sha256", normalizedSecret)
    .update(`communication:${normalizedUserId}`)
    .digest("hex");

  return `communication-${digest}`;
}
