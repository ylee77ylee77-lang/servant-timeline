/**
 * Generate safe Supabase Storage keys. The human-readable file name remains
 * in communication_messages.attachment_name and is not part of the object key.
 */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function makeCommunicationStorageKey(
  senderId: string,
  recipientId: string,
  uploadId: string,
  mime: string
): string {
  const extension = EXTENSION_BY_MIME[mime.toLowerCase()];
  if (!extension) throw new Error("不支援的附件類型。");
  if (![senderId, recipientId, uploadId].every((value) => UUID_PATTERN.test(value))) {
    throw new Error("附件路徑識別碼無效。");
  }
  return `${senderId}/${recipientId}/${uploadId}.${extension}`;
}
