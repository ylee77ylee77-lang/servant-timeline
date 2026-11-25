import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultAvatarConfig,
  isAvatarPersonalized,
  normalizeAvatarConfig,
  getAvatarNameMark,
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
    displayMode: "custom",
    iconType: "cross",
    iconTone: "lavender",
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
      displayMode: "name",
      iconType: "church",
      iconTone: "blue",
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
      pet: "eagle",
      displayMode: "name",
      iconType: "church",
      iconTone: "blue",
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
      displayMode: "custom",
      iconType: "cross",
      iconTone: "lavender",
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
    displayMode: "javascript:",
    iconType: "<script>",
    iconTone: "transparent",
    glasses: "yes",
  });

  assert.equal(normalized.style, "neutral");
  assert.equal(normalized.hair, "short");
  assert.equal(normalized.background, "lavender");
  assert.equal(normalized.eyeStyle, "soft");
  assert.equal(normalized.accessory, "none");
  assert.equal(normalized.pet, "none");
  assert.equal(normalized.glasses, false);
  assert.equal(normalized.displayMode, "custom");
  assert.equal(normalized.iconType, "cross");
  assert.equal(normalized.iconTone, "lavender");
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


test("display settings persist without erasing a configured portrait", () => {
  const saved = normalizeAvatarConfig({
    style: "feminine", glasses: true, pet: "eagle",
    background: "mint", displayMode: "custom",
  });
  const hidden = normalizeAvatarConfig({ ...saved, displayMode: "default" });
  const named = normalizeAvatarConfig({ ...hidden, displayMode: "name" });
  const restored = normalizeAvatarConfig({ ...named, displayMode: "custom" });
  assert.equal(isAvatarPersonalized(hidden), true);
  assert.equal(isAvatarPersonalized(named), true);
  assert.equal(hidden.displayMode, "default");
  assert.equal(named.displayMode, "name");
  assert.deepEqual(restored, saved);
});

test("name identifiers use existing profile display names only", () => {
  assert.equal(getAvatarNameMark("王小明"), "小明");
  assert.equal(getAvatarNameMark("夏"), "夏");
  assert.equal(getAvatarNameMark("Alice Brown"), "AB");
  assert.equal(getAvatarNameMark(" Alice "), "A");
  assert.equal(getAvatarNameMark(""), "");
  assert.equal(getAvatarNameMark(null), "");
});


test("six faith icons and six muted tones have allowlisted persisted values", () => {
  for (const iconType of ["cross", "bible", "prayer", "angel", "palm", "church"]) {
    assert.equal(normalizeAvatarConfig({ displayMode: "default", iconType }).iconType, iconType);
  }
  for (const iconTone of ["warm", "cool", "charcoal", "beige", "blue", "lavender"]) {
    assert.equal(normalizeAvatarConfig({ displayMode: "default", iconTone }).iconTone, iconTone);
  }
  const saved = normalizeAvatarConfig({ style: "feminine", glasses: true, pet: "doe", displayMode: "default", iconType: "church", iconTone: "blue" });
  const restored = normalizeAvatarConfig({ ...saved, displayMode: "custom" });
  assert.equal(restored.iconType, "church");
  assert.equal(restored.iconTone, "blue");
  assert.equal(restored.pet, "doe");
  assert.equal(restored.style, "feminine");
});

test("P2 portrait preference is explicit and safe for old JSON", () => {
  const legacy = normalizeAvatarConfig({ style: "masculine", hair: "wave", hairColor: "brown", glasses: true });
  assert.equal(Object.hasOwn(legacy, "portraitVersion"), false);
  assert.equal(Object.hasOwn(legacy, "glassesStyle"), false);
  const layered = normalizeAvatarConfig({ ...legacy, portraitVersion: "v3", glassesStyle: "round" });
  assert.equal(layered.portraitVersion, "v3");
  assert.equal(layered.glassesStyle, "round");
  assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(layered))), layered);
  assert.equal(normalizeAvatarConfig({ ...layered, displayMode: "name" }).portraitVersion, "v3");
  assert.equal(normalizeAvatarConfig({ ...layered, portraitVersion: "https://unsafe", glassesStyle: "<script>" }).portraitVersion, undefined);
  assert.equal(normalizeAvatarConfig({ ...layered, glassesStyle: "<script>" }).glassesStyle, undefined);
  assert.equal(normalizeAvatarConfig({ ...layered, style: "neutral" }).portraitVersion, undefined);
});
