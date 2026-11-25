import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultAvatarConfig,
  normalizeAvatarConfig,
  type AvatarMaterialColors,
} from "../lib/profile/avatar.ts";

test("legacy avatar data keeps its exact normalized identity without material overrides", () => {
  for (const style of ["masculine", "feminine", "neutral"] as const) {
    const original = getDefaultAvatarConfig(style);
    const restored = normalizeAvatarConfig(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(restored, original);
    assert.equal(Object.hasOwn(restored, "materialColors"), false);
  }
});

test("saved material colors preserve exact RGB across repeated profile read/write normalization", () => {
  const materialColors: AvatarMaterialColors = {
    hair: "#000000", skin: "#BFA768", frame: "#FFFFFF",
  };
  let avatar = normalizeAvatarConfig({
    ...getDefaultAvatarConfig("feminine"),
    materialColors,
    glasses: true,
    background: "mint",
    pet: "eagle",
  });
  const original = structuredClone(avatar);
  for (let i = 0; i < 5; i++) {
    avatar = normalizeAvatarConfig(JSON.parse(JSON.stringify(avatar)));
    assert.deepEqual(avatar, original);
  }
  assert.deepEqual(avatar.materialColors, materialColors);
});

test("material normalization allows only three own strict six-digit RGB values", () => {
  const avatar = normalizeAvatarConfig({
    style: "masculine",
    materialColors: {
      hair: "#aBcDeF", skin: "#bf984a", frame: "#123456",
      eyes: "#123456", src: "https://example.invalid/avatar.svg",
    },
  });
  assert.deepEqual(avatar.materialColors, {
    hair: "#ABCDEF", skin: "#BF984A", frame: "#123456",
  });
  // This is a persistence format validator. Skin gamut restriction belongs to
  // the picker and must not silently alter already stored RGB colors.
  assert.equal(normalizeAvatarConfig({
    materialColors: { skin: "#0000ff" },
  }).materialColors?.skin, "#0000FF");
});

test("malformed material payloads and color values are safely omitted", () => {
  for (const materialColors of [undefined, null, false, 0, "#123456", [], ["#123456"], {}]) {
    assert.equal(Object.hasOwn(normalizeAvatarConfig({ materialColors }), "materialColors"), false);
  }
  for (const invalid of [
    "#abc", "#12345678", "123456", " #123456", "#123456 ", "#123456\n",
    "#GGGGGG", "rgb(1,2,3)", "url(https://example.invalid)", "<script>",
    null, undefined, false, 123456, {}, ["#123456"],
  ]) {
    const avatar = normalizeAvatarConfig({
      materialColors: { hair: invalid, skin: invalid, frame: invalid, unknown: "#123456" },
    });
    assert.equal(Object.hasOwn(avatar, "materialColors"), false);
    assert.deepEqual(avatar, getDefaultAvatarConfig());
  }
  assert.deepEqual(normalizeAvatarConfig({
    materialColors: { hair: "#123456", skin: "invalid", frame: false },
  }).materialColors, { hair: "#123456" });
});

test("material normalization ignores inherited properties and prototype-shaped keys", () => {
  const inheritedContainer = Object.assign(Object.create({
    materialColors: { hair: "#ABCDEF" },
  }), { style: "masculine" });
  assert.equal(Object.hasOwn(normalizeAvatarConfig(inheritedContainer), "materialColors"), false);

  const inheritedColors = Object.assign(Object.create({ hair: "#ABCDEF", frame: "#000000" }), {
    skin: "#BFA768",
  });
  assert.deepEqual(normalizeAvatarConfig({ materialColors: inheritedColors }).materialColors, {
    skin: "#BFA768",
  });

  const avatar = normalizeAvatarConfig(JSON.parse(
    '{"materialColors":{"hair":"#123456","__proto__":{"frame":"#ABCDEF"},"constructor":"#123456","toString":"#123456"}}',
  ));
  assert.deepEqual(avatar.materialColors, { hair: "#123456" });
  assert.equal(Object.getPrototypeOf(avatar.materialColors), Object.prototype);
  assert.equal(Object.hasOwn(avatar.materialColors!, "__proto__"), false);
});

test("display mode and glasses visibility preserve all stored material colors", () => {
  const saved = normalizeAvatarConfig({
    style: "masculine", glasses: true,
    materialColors: { hair: "#654539", skin: "#BFA768", frame: "#746198" },
  });
  for (const displayMode of ["custom", "default", "name"] as const) {
    const hidden = normalizeAvatarConfig({ ...saved, displayMode, glasses: false });
    assert.deepEqual(hidden.materialColors, saved.materialColors);
    assert.deepEqual(normalizeAvatarConfig({ ...hidden, displayMode: "custom", glasses: true }), saved);
  }
});

test("normalization copies colors and never adds overrides to shared defaults", () => {
  const materialColors = { hair: "#123456", skin: "#BFA768" };
  const avatar = normalizeAvatarConfig({ style: "feminine", materialColors });
  assert.notEqual(avatar.materialColors, materialColors);
  materialColors.hair = "#FFFFFF";
  assert.equal(avatar.materialColors?.hair, "#123456");
  assert.equal(Object.hasOwn(getDefaultAvatarConfig("feminine"), "materialColors"), false);
});
