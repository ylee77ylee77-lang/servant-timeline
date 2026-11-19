import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultAvatarConfig,
  normalizeAvatarConfig,
} from "../lib/profile/avatar.ts";

test("avatar defaults keep a clear neutral fallback", () => {
  assert.deepEqual(getDefaultAvatarConfig(), {
    style: "neutral",
    skinTone: "warm",
    hair: "short",
    hairColor: "dark",
    outfit: "shirt",
    background: "lavender",
    glasses: false,
  });
});

test("avatar normalization preserves valid masculine and feminine choices", () => {
  assert.deepEqual(
    normalizeAvatarConfig({
      style: "masculine",
      skinTone: "deep",
      hair: "side",
      hairColor: "gray",
      outfit: "jacket",
      background: "sky",
      glasses: true,
    }),
    {
      style: "masculine",
      skinTone: "deep",
      hair: "side",
      hairColor: "gray",
      outfit: "jacket",
      background: "sky",
      glasses: true,
    }
  );

  assert.equal(
    normalizeAvatarConfig({ style: "feminine", hair: "long" }).style,
    "feminine"
  );
});

test("avatar normalization rejects unknown values without storing arbitrary data", () => {
  const normalized = normalizeAvatarConfig({
    style: "unknown",
    hair: "<script>",
    background: "javascript:",
    glasses: "yes",
  });

  assert.equal(normalized.style, "neutral");
  assert.equal(normalized.hair, "short");
  assert.equal(normalized.background, "lavender");
  assert.equal(normalized.glasses, false);
});
