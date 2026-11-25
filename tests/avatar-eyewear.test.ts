import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_DEFAULTS, normalizeAvatarConfig } from "../lib/profile/avatar.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import { AVATAR_PORTRAITS, AVATAR_CLASSIC_DARK_PORTRAITS, selectClassicHairTone } from "../lib/profile/avatar-portrait.ts";
import { getAvatarMaterialChannels, getAvatarMaterialPlan } from "../lib/profile/avatar-materials.ts";
import { AVATAR_EYEWEAR_CHOICES, getAvatarLegacyEyewearChoice, getAvatarEyewearPlan, selectAvatarLegacyEyewear, getAvatarEyewearShades } from "../lib/profile/avatar-eyewear.ts";

test("old saved glasses style never changes the original classic art", () => {
  for (const style of ["masculine", "feminine"] as const) {
    const legacy = normalizeAvatarConfig({ ...AVATAR_DEFAULTS[style], glasses: true, glassesStyle: "round" });
    assert.equal(legacy.eyewearVersion, undefined);
    assert.equal(getAvatarLegacyEyewearChoice(legacy), "classic");
    assert.equal(getAvatarScene(legacy).portrait, AVATAR_PORTRAITS[style].glasses);
    assert.equal(getAvatarEyewearPlan(legacy), null);
    assert.equal(getAvatarEyewearPlan({ ...legacy, portraitVersion: "v3", eyewearVersion: "v1" }), null);
  }
});
test("new styles explicitly opt in, keep exact material colors and legacy black hair", () => {
  assert.deepEqual(AVATAR_EYEWEAR_CHOICES.map(v => v.value), ["none", "classic", "round", "square"]);
  for (const style of ["masculine", "feminine"] as const) {
    const original = normalizeAvatarConfig({ ...AVATAR_DEFAULTS[style], glasses: true, materialColors: { hair: "#654539", skin: "#BC855E", frame: "#B88E55" }, pet: "eagle", background: "mint" });
    for (const tone of ["brown", "dark"] as const) {
      const base = selectClassicHairTone(original, tone);
      for (const choice of ["round", "square"] as const) {
        const next = normalizeAvatarConfig(JSON.parse(JSON.stringify(selectAvatarLegacyEyewear(base, choice))));
        assert.equal(next.eyewearVersion, "v1");
        assert.equal(next.glassesStyle, choice);
        assert.equal(next.portraitVersion, base.portraitVersion);
        assert.deepEqual(next.materialColors, original.materialColors);
        assert.equal(next.pet, "eagle");
        assert.equal(next.background, "mint");
        const scene = getAvatarScene(next);
        assert.equal(scene.portrait, (tone === "dark" ? AVATAR_CLASSIC_DARK_PORTRAITS : AVATAR_PORTRAITS)[style].plain);
        assert.equal(scene.portraitLayers.length, 1);
        assert.equal(getAvatarEyewearPlan(next)?.choice, choice);
        assert.equal(getAvatarEyewearPlan(next)?.color, "#B88E55");
        assert.deepEqual(getAvatarMaterialChannels(next).map(v => v.part), ["hair", "skin", "frame"]);
        assert.ok(scene.portrait);
        assert.deepEqual(getAvatarMaterialPlan(scene.portrait, next.materialColors)?.channels.map(v => v.part), ["hair", "skin"]);
        const hidden = selectAvatarLegacyEyewear(next, "none");
        assert.equal(hidden.eyewearVersion, "v1");
        assert.equal(getAvatarEyewearPlan(hidden), null);
        assert.deepEqual(getAvatarMaterialChannels(hidden).map(v => v.part), ["hair", "skin"]);
        assert.deepEqual(selectAvatarLegacyEyewear(hidden, choice), next);
        for (const displayMode of ["name", "default"] as const) {
          const mode = normalizeAvatarConfig({ ...next, displayMode });
          assert.equal(getAvatarEyewearPlan(mode), null);
          assert.equal(getAvatarScene(mode).portrait, null);
          assert.equal(mode.eyewearVersion, "v1");
        }
        const classic = selectAvatarLegacyEyewear(next, "classic");
        assert.equal(classic.eyewearVersion, undefined);
        assert.equal(getAvatarScene(classic).portrait, (tone === "dark" ? AVATAR_CLASSIC_DARK_PORTRAITS : AVATAR_PORTRAITS)[style].glasses);
      }
    }
  }
});
test("malformed or incompatible eyewear flags do not activate new art", () => {
  for (const data of [
    { style: "neutral", glasses: true, eyewearVersion: "v1", glassesStyle: "round" },
    { style: "masculine", glasses: true, eyewearVersion: "v99", glassesStyle: "round" },
    { style: "masculine", glasses: true, eyewearVersion: "v1", glassesStyle: "url(x)" },
    { style: "masculine", glasses: true, eyewearVersion: "v1", glassesStyle: "classic" },
    { style: "masculine", glasses: true, eyewearVersion: "v1", glassesStyle: "round", portraitVersion: "v3" },
    Object.assign(Object.create({ eyewearVersion: "v1" }), { style: "masculine", glasses: true, glassesStyle: "round" }),
  ]) {
    const avatar = normalizeAvatarConfig(data);
    assert.equal(avatar.eyewearVersion, undefined);
    assert.equal(getAvatarEyewearPlan(avatar), null);
  }
});
test("each shape and character has its own geometry, while colors preserve geometry", () => {
  const male = selectAvatarLegacyEyewear(AVATAR_DEFAULTS.masculine, "round");
  const female = selectAvatarLegacyEyewear(AVATAR_DEFAULTS.feminine, "round");
  const a = getAvatarEyewearPlan(male)!;
  const b = getAvatarEyewearPlan(female)!;
  assert.notDeepEqual(a.geometry, b.geometry);
  assert.notDeepEqual(a.geometry, getAvatarEyewearPlan(selectAvatarLegacyEyewear(male, "square"))!.geometry);
  assert.equal(getAvatarEyewearPlan({ ...male, materialColors: { frame: "#FFFFFF" } })!.geometry, a.geometry);
  for (const color of ["#000000", "#FFFFFF", "#B88E55", "#FF0080"] as const) {
    const shades = getAvatarEyewearShades(color);
    for (const shade of Object.values(shades)) assert.match(shade, /^#[A-F0-9]{6}$/);
    assert.notEqual(shades.highlight, shades.shadow);
  }
});
