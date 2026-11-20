// Shared by the browser recorder and server-side attachment validation.
export const AUDIO_MIME_TYPES = ["audio/mp4", "audio/webm", "audio/ogg"] as const;
export const MAX_VOICE_NOTE_BYTES = 4 * 1024 * 1024;
export const MAX_VOICE_NOTE_SECONDS = 60;

export function baseMediaMime(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isVoiceMime(value: string) {
  return AUDIO_MIME_TYPES.some((mime) => mime === baseMediaMime(value));
}

export function supportedRecordingMime(supports: (mime: string) => boolean) {
  const options = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return options.find((mime) => supports(mime)) ?? "";
}

export function extensionForVoiceMime(value: string) {
  const mime = baseMediaMime(value);
  if (mime === "audio/mp4") return "m4a";
  if (mime === "audio/webm") return "webm";
  if (mime === "audio/ogg") return "ogg";
  return "";
}

export function matchesVoiceSignature(bytes: Uint8Array, mime: string) {
  const kind = baseMediaMime(mime);
  if (kind === "audio/webm") {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45
      && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (kind === "audio/mp4") {
    return bytes.length >= 12 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";
  }
  if (kind === "audio/ogg") {
    return bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === "OggS";
  }
  return false;
}
