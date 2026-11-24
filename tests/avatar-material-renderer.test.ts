import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvatarConfig } from "../lib/profile/avatar.ts";
import {
  AVATAR_PORTRAITS,
  AVATAR_CLASSIC_DARK_PORTRAITS,
  selectClassicHairTone,
} from "../lib/profile/avatar-portrait.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import {
  getAvatarMaterialSource,
  getAvatarMaterialChannels,
  getAvatarMaterialPlan,
  setAvatarMaterialColor,
} from "../lib/profile/avatar-materials.ts";

test("legacy brown and opt-in black portraits have no material filter without an explicit color", () => {
  for (const style of ["masculine", "feminine"] as const) {
    for (const glasses of [false, true]) {
      const original = normalizeAvatarConfig({ style, glasses, hairColor: "dark" });
      for (const avatar of [original, selectClassicHairTone(original, "dark")]) {
        const scene = getAvatarScene(avatar);
        assert.equal(scene.portraitLayers.length, 1);
        for (const layer of scene.portraitLayers) {
          assert.equal(getAvatarMaterialPlan(layer.src, scene.avatar.materialColors), null);
          assert.equal(getAvatarMaterialPlan(layer.src, {}), null);
        }
      }
    }
  }
});

test("material coverage never attaches to unknown portraits, companion artwork or user URLs", () => {
  for (const src of [
    "", "/avatar/scenes/v3/future/face.webp", "/avatar/scenes/v2/sheep-behind.webp",
    "/avatar/scenes/v2/male.webp?variant=new", "/avatar/scenes/v2/../v2/male.webp",
    "https://example.invalid/avatar/scenes/v2/male.webp", "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
  ]) {
    assert.equal(getAvatarMaterialSource(src), null);
    assert.equal(getAvatarMaterialPlan(src, {
      hair: "#654539", skin: "#BFA768", frame: "#746198",
    }), null);
  }
});

test("malformed color input is removed before a scene can request a material filter", () => {
  const scene = getAvatarScene({
    style: "feminine", glasses: true,
    materialColors: { hair: "url(https://example.invalid)", skin: ["#BFA768"], frame: "#123456\n" },
  });
  assert.equal(scene.avatar.materialColors, undefined);
  assert.equal(scene.portrait, AVATAR_PORTRAITS.feminine.glasses);
  assert.equal(getAvatarMaterialPlan(scene.portrait!, scene.avatar.materialColors), null);
});

test("hiding glasses stops frame recoloring while retaining the saved frame color", () => {
  const saved = normalizeAvatarConfig({
    style: "feminine", glasses: true,
    materialColors: { hair: "#654539", skin: "#BFA768", frame: "#746198" },
  });
  const visible = getAvatarScene(saved);
  const visiblePlan = getAvatarMaterialPlan(visible.portrait!, saved.materialColors);
  assert.deepEqual(visiblePlan?.channels.map((channel) => channel.part), ["hair", "skin", "frame"]);

  const hidden = getAvatarScene({ ...saved, glasses: false });
  const hiddenPlan = getAvatarMaterialPlan(hidden.portrait!, hidden.avatar.materialColors);
  assert.equal(hidden.avatar.materialColors?.frame, "#746198");
  assert.deepEqual(hiddenPlan?.channels.map((channel) => channel.part), ["hair", "skin"]);
  assert.deepEqual(getAvatarMaterialChannels(hidden.avatar).map((channel) => channel.part), ["hair", "skin"]);
  assert.equal(getAvatarMaterialPlan(hidden.portrait!, { frame: "#746198" }), null);

  const restored = getAvatarScene({ ...hidden.avatar, glasses: true });
  assert.deepEqual(getAvatarMaterialPlan(restored.portrait!, restored.avatar.materialColors), visiblePlan);
});

test("resetting one channel preserves other choices and removing the last restores the original scene", () => {
  const original = normalizeAvatarConfig({
    style: "masculine", glasses: true, background: "mint", pet: "eagle",
  });
  const colored = normalizeAvatarConfig({
    ...original, materialColors: { hair: "#654539", skin: "#BFA768", frame: "#746198" },
  });
  Object.freeze(colored.materialColors);
  Object.freeze(colored);
  const withoutSkin = setAvatarMaterialColor(colored, "skin", null);
  assert.deepEqual(withoutSkin.materialColors, { hair: "#654539", frame: "#746198" });
  assert.equal(colored.materialColors?.skin, "#BFA768");
  assert.deepEqual(getAvatarScene(withoutSkin).companion, getAvatarScene(original).companion);
  assert.deepEqual(getAvatarScene(withoutSkin).gradient, getAvatarScene(original).gradient);

  const withoutFrame = setAvatarMaterialColor(withoutSkin, "frame", null);
  const restored = setAvatarMaterialColor(withoutFrame, "hair", null);
  assert.equal(Object.hasOwn(restored, "materialColors"), false);
  assert.deepEqual(restored, original);
  assert.deepEqual(getAvatarScene(restored), getAvatarScene(original));
});

test("custom hair retains the saved black source and reset preserves remaining colors", () => {
  for (const style of ["masculine", "feminine"] as const) {
    for (const glasses of [false, true]) {
      const variant = glasses ? "glasses" : "plain";
      const original = normalizeAvatarConfig({
        style, glasses, background: "sand", pet: "doe",
        materialColors: { skin: "#BFA768", frame: "#746198" },
      });
      const black = selectClassicHairTone(original, "dark");
      const before = getAvatarScene(black);
      const previousPlan = getAvatarMaterialPlan(before.portrait!, black.materialColors);
      assert.equal(before.portrait, AVATAR_CLASSIC_DARK_PORTRAITS[style][variant]);

      const colored = setAvatarMaterialColor(black, "hair", "#80618F");
      const changed = getAvatarScene(colored);
      assert.equal(changed.portrait, AVATAR_CLASSIC_DARK_PORTRAITS[style][variant]);
      assert.deepEqual(changed.portraitLayers, before.portraitLayers);
      assert.equal(changed.avatar.portraitVersion, "v2-tone");
      assert.deepEqual(changed.companion, before.companion);
      assert.deepEqual(changed.gradient, before.gradient);
      const changedPlan = getAvatarMaterialPlan(changed.portrait!, colored.materialColors);
      assert.ok(changedPlan);
      assert.ok(changedPlan.channels.some((channel) => channel.part === "hair"));
      assert.deepEqual(changedPlan.channels.filter((channel) => channel.part !== "hair"), previousPlan?.channels);
      assert.equal(
        getAvatarMaterialChannels(colored).find((channel) => channel.part === "hair")?.original,
        getAvatarMaterialChannels(black).find((channel) => channel.part === "hair")?.original,
      );

      const restored = setAvatarMaterialColor(colored, "hair", null);
      assert.deepEqual(restored, black);
      assert.deepEqual(restored.materialColors, { skin: "#BFA768", frame: "#746198" });
      assert.deepEqual(getAvatarScene(restored), before);
      assert.deepEqual(getAvatarMaterialPlan(before.portrait!, restored.materialColors), previousPlan);
    }
  }
});

test("skin color stays exact through scene normalization and independent channel updates", () => {
  let avatar = normalizeAvatarConfig({
    style: "feminine", glasses: true, materialColors: { skin: "#BFA768" },
  });
  const originalScene = getAvatarScene(avatar);
  const originalSkin = getAvatarMaterialPlan(originalScene.portrait!, avatar.materialColors)?.channels.find((channel) => channel.part === "skin");
  assert.ok(originalSkin);
  avatar = setAvatarMaterialColor(avatar, "hair", "#000000");
  avatar = setAvatarMaterialColor(avatar, "frame", "#FFFFFF");
  avatar = normalizeAvatarConfig(JSON.parse(JSON.stringify(avatar)));
  const scene = getAvatarScene(avatar);
  assert.equal(scene.avatar.materialColors?.skin, "#BFA768");
  assert.deepEqual(getAvatarMaterialPlan(scene.portrait!, avatar.materialColors)?.channels.find((channel) => channel.part === "skin"), originalSkin);
});

test("neutral, name and icon display modes do not create recolored portrait layers", () => {
  const avatar = normalizeAvatarConfig({
    style: "masculine", glasses: true,
    materialColors: { hair: "#654539", skin: "#BFA768", frame: "#746198" },
  });
  const neutral = getAvatarScene({ ...avatar, style: "neutral" });
  assert.equal(neutral.portrait, null);
  assert.deepEqual(neutral.portraitLayers, []);
  assert.deepEqual(getAvatarMaterialChannels(neutral.avatar), []);
  for (const displayMode of ["default", "name"] as const) {
    const hidden = getAvatarScene({ ...avatar, displayMode });
    assert.equal(hidden.portrait, null);
    assert.deepEqual(hidden.portraitLayers, []);
    assert.deepEqual(hidden.avatar.materialColors, avatar.materialColors);
    assert.deepEqual(getAvatarScene({ ...hidden.avatar, displayMode: "custom" }), getAvatarScene(avatar));
  }
});
