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
      pet: "eagle",
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
    pet: "doe",
  });
  assert.equal(feminine.style, "feminine");
  assert.equal(feminine.hairColor, "auburn");
  assert.equal(feminine.accessory, "earrings");
  assert.equal(feminine.pet, "doe");
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
  assert.equal(isAvatarPersonalized({ ...getDefaultAvatarConfig(), pet: "sheep" }), true);
});


test("the four companion animals are accepted and legacy pets are safely ignored", () => {
  for (const pet of ["sheep", "doe", "lion", "eagle"]) {
    assert.equal(normalizeAvatarConfig({ style: "feminine", pet }).pet, pet);
  }
  for (const oldPet of ["dog", "cat", "bird"]) {
    assert.equal(normalizeAvatarConfig({ pet: oldPet }).pet, "none");
  }
});

test("changing the background does not change avatar identity or companion", () => {
  const initial = normalizeAvatarConfig({
    style: "feminine", glasses: true, pet: "eagle", background: "lavender",
  });
  const updated = normalizeAvatarConfig({ ...initial, background: "mint" });
  assert.equal(updated.style, "feminine");
  assert.equal(updated.glasses, true);
  assert.equal(updated.pet, "eagle");
  assert.equal(updated.background, "mint");
});
