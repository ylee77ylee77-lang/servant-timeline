import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultAvatarConfig,
  isAvatarPersonalized,
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
    eyeStyle: "soft",
    glasses: false,
    accessory: "none",
    pet: "none",
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
      eyeStyle: "bright",
      glasses: true,
      accessory: "cap",
      pet: "dog",
    }),
    {
      style: "masculine",
      skinTone: "deep",
      hair: "side",
      hairColor: "gray",
      outfit: "jacket",
      background: "sky",
      eyeStyle: "bright",
      glasses: true,
      accessory: "cap",
      pet: "dog",
    }
  );

  const feminine = normalizeAvatarConfig({
    style: "feminine",
    hair: "long",
    hairColor: "auburn",
    accessory: "earrings",
    pet: "bird",
  });
  assert.equal(feminine.style, "feminine");
  assert.equal(feminine.hairColor, "auburn");
  assert.equal(feminine.accessory, "earrings");
  assert.equal(feminine.pet, "bird");
});

test("old avatar JSON gains safe defaults for newly added fields", () => {
  assert.deepEqual(
    normalizeAvatarConfig({
      style: "masculine",
      skinTone: "warm",
      hair: "short",
      hairColor: "dark",
      outfit: "polo",
      background: "sky",
      glasses: false,
    }),
    {
      style: "masculine",
      skinTone: "warm",
      hair: "short",
      hairColor: "dark",
      outfit: "polo",
      background: "sky",
      eyeStyle: "bright",
      glasses: false,
      accessory: "none",
      pet: "none",
    }
  );
});

test("avatar normalization rejects unknown values without storing arbitrary data", () => {
  const normalized = normalizeAvatarConfig({
    style: "unknown",
    hair: "<script>",
    background: "javascript:",
    eyeStyle: "giant",
    accessory: "unsafe",
    pet: "tiger",
    glasses: "yes",
  });

  assert.equal(normalized.style, "neutral");
  assert.equal(normalized.hair, "short");
  assert.equal(normalized.background, "lavender");
  assert.equal(normalized.eyeStyle, "soft");
  assert.equal(normalized.accessory, "none");
  assert.equal(normalized.pet, "none");
  assert.equal(normalized.glasses, false);
});

test("personalization detects either a chosen base role or optional pet", () => {
  assert.equal(isAvatarPersonalized(getDefaultAvatarConfig()), false);
  assert.equal(isAvatarPersonalized(getDefaultAvatarConfig("masculine")), true);
  assert.equal(isAvatarPersonalized({ ...getDefaultAvatarConfig(), pet: "cat" }), true);
});
