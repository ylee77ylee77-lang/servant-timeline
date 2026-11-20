import assert from "node:assert/strict";
import test from "node:test";
import { createRingtoneWav } from "../lib/communications/ringtone-wave.ts";

test("ringtone is a valid generated WAV asset", async () => {
  const sound = createRingtoneWav();
  assert.equal(sound.type, "audio/wav");
  assert.ok(sound.size > 44);

  const view = new DataView(await sound.arrayBuffer());
  const ascii = (at: number) =>
    String.fromCharCode(...Array.from({ length: 4 }, (_, index) => view.getUint8(at + index)));
  assert.equal(ascii(0), "RIFF");
  assert.equal(ascii(8), "WAVE");
  assert.equal(ascii(36), "data");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint32(40, true), sound.size - 44);
});
