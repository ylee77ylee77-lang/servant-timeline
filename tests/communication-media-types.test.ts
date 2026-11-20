import assert from "node:assert/strict";
import test from "node:test";
import {
  AUDIO_MIME_TYPES,
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_SECONDS,
  baseMediaMime,
  extensionForVoiceMime,
  isVoiceMime,
  matchesVoiceSignature,
  supportedRecordingMime,
} from "../lib/communications/media-types.ts";

test("accept iOS mp4 and modern webm/ogg recorder formats", () => {
  assert.equal(baseMediaMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(baseMediaMime(" AUDIO/MP4 ; codecs=mp4a.40.2"), "audio/mp4");
  assert.equal(isVoiceMime("audio/mp4"), true);
  assert.equal(isVoiceMime("audio/webm;codecs=opus"), true);
  assert.equal(isVoiceMime("image/png"), false);
  assert.equal(extensionForVoiceMime("audio/mp4"), "m4a");
  assert.equal(extensionForVoiceMime("audio/ogg"), "ogg");
  assert.equal(extensionForVoiceMime("audio/webm;codecs=opus"), "webm");
  assert.equal(AUDIO_MIME_TYPES.length, 3);
  assert.equal(MAX_VOICE_NOTE_BYTES, 4 * 1024 * 1024);
  assert.equal(MAX_VOICE_NOTE_SECONDS, 60);
});

test("prefer Apple-compatible audio/mp4 when supported", () => {
  assert.equal(
    supportedRecordingMime((mime) => mime === "audio/mp4" || mime === "audio/webm"),
    "audio/mp4"
  );
  assert.equal(
    supportedRecordingMime((mime) => mime === "audio/webm;codecs=opus"),
    "audio/webm;codecs=opus"
  );
  assert.equal(supportedRecordingMime(() => false), "");
});

test("verify recorder file signatures server-side", () => {
  const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0]);
  const mp4 = new TextEncoder().encode("0000ftypisom");
  const ogg = new TextEncoder().encode("OggS0000");
  const bad = new TextEncoder().encode("fake audio data");
  assert.equal(matchesVoiceSignature(webm, "audio/webm"), true);
  assert.equal(matchesVoiceSignature(mp4, "audio/mp4"), true);
  assert.equal(matchesVoiceSignature(ogg, "audio/ogg"), true);
  for (const mime of AUDIO_MIME_TYPES) assert.equal(matchesVoiceSignature(bad, mime), false);
});
