import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/server-admin";
import {
  AUDIO_MIME_TYPES,
  MAX_VOICE_NOTE_BYTES,
  baseMediaMime,
  isVoiceMime,
} from "@/lib/communications/media-types";

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
  ...AUDIO_MIME_TYPES,
]);

export function isAllowedCommunicationFile(file: File) {
  const mime = baseMediaMime(file.type);
  const sizeLimit = isVoiceMime(mime) ? MAX_VOICE_NOTE_BYTES : MAX_COMMUNICATION_FILE_SIZE;
  return file.size > 0
    && file.size <= sizeLimit
    && ALLOWED_MIME_TYPES.has(mime);
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

  if (data && !error) {
    // Existing private buckets may predate voice notes. Expand only the MIME
    // allowlist; never make the bucket public or increase its 10 MB limit.
    if (Array.isArray(data.allowed_mime_types)
      && AUDIO_MIME_TYPES.some((mime) => !data.allowed_mime_types?.includes(mime))) {
      const { error: updateError } = await supabase.storage.updateBucket(
        COMMUNICATION_BUCKET,
        {
          public: false,
          fileSizeLimit: Math.min(data.file_size_limit ?? MAX_COMMUNICATION_FILE_SIZE, MAX_COMMUNICATION_FILE_SIZE),
          allowedMimeTypes: [...new Set([...data.allowed_mime_types, ...AUDIO_MIME_TYPES])],
        }
      );
      if (updateError) throw updateError;
    }
    return;
  }

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
