import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dir = new URL("../docs/avatar-face-masters/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
for (const id of ["male-b", "female-b"] as const) {
  test(`independent face candidate ${id} has pinned 512px transparent WebP metadata`, () => {
    const art = readFileSync(new URL(`${id}.webp`, dir));
    const expected = manifest.masters[id];
    assert.equal(manifest.status, "candidate-only");
    assert.equal(art.length, expected.bytes);
    assert.equal(createHash("sha256").update(art).digest("hex"), expected.sha256);
    assert.equal(art.toString("ascii", 0, 4), "RIFF");
    assert.equal(art.readUInt32LE(4) + 8, art.length);
    assert.equal(art.toString("ascii", 8, 16), "WEBPVP8X");
    assert.equal(art[20] & 0x10, 0x10, "alpha feature flag");
    assert.equal(art.readUIntLE(24, 3) + 1, 512);
    assert.equal(art.readUIntLE(27, 3) + 1, 512);
  });
}
