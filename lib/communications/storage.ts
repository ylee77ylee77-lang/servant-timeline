import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";

export const COMMUNICATION_BUCKET = "communication-attachments";
export const MAX_COMMUNICATION_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

export function isAllowedCommunicationFile(file: File) {
  return file.size > 0
    && file.size <= MAX_COMMUNICATION_FILE_SIZE
    && ALLOWED_MIME_TYPES.has(file.type);
}

export function isImageCommunicationFile(file: File) {
  return file.type.startsWith("image/");
}

export function sanitizeAttachmentName(name: string) {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\\/\0<>:"|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(0, 160);
}

export async function ensureCommunicationBucket() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.getBucket(COMMUNICATION_BUCKET);

  if (data && !error) return;

  const { error: createError } = await supabase.storage.createBucket(
    COMMUNICATION_BUCKET,
    {
      public: false,
      fileSizeLimit: MAX_COMMUNICATION_FILE_SIZE,
      allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
    }
  );

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw createError;
  }
}
