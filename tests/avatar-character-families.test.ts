import test from "node:test";
import assert from "node:assert/strict";
import { AVATAR_FAMILY_STYLES, normalizeAvatarConfig, type AvatarConfig, type AvatarFamilyId } from "../lib/profile/avatar.ts";
import { AVATAR_PORTRAITS, AVATAR_CLASSIC_DARK_PORTRAITS, getAvatarPortraitOptions, getAvatarPortraitPlan, getAvatarLayerMaterial, selectAvatarPortraitFamily, selectAvatarPortraitVersion, selectAvatarFamilyHair, selectAvatarFamilyGlasses, type AvatarPortraitFamily, type AvatarLayerMaterial } from "../lib/profile/avatar-portrait.ts";
import { getAvatarMaterialChannels, getAvatarMaterialPlan } from "../lib/profile/avatar-materials.ts";
import { getAvatarEyewearPlan } from "../lib/profile/avatar-eyewear.ts";

// Test-only registry. No fixture path is ever registered or loaded by the app.
function fixture(id: AvatarFamilyId): AvatarPortraitFamily {
  const style = AVATAR_FAMILY_STYLES[id];
  const makePath = (name: string) => `/avatar/scenes/v3/test-${id}/${name}.webp` as const;
  const materials: Record<string, AvatarLayerMaterial> = {};
  function asset(name: string, part: AvatarLayerMaterial["part"], original: AvatarLayerMaterial["original"]) {
    const source = makePath(name);
    materials[source] = {
      part, original,
      coverageUri: `/avatar/materials/v3/test-${id}/${name}.png`,
      sourceSha256: "0".repeat(64), coverageSha256: "0".repeat(64),
    };
    return source;
  }
  const choices = style === "masculine" ? ["side", "short", "wave"] as const : ["long", "bob", "bun"] as const;
  function hair(value: typeof choices[number]) {
    return {
      value, label: value,
      colors: [{ value: "brown", label: "原色", back: asset(value + "-back", "hair", "#674637"), front: asset(value + "-front", "hair", "#674637") }] as const,
    };
  }
  return {
    id, style, label: id, faceBody: asset("face", "skin", "#EDB18D"),
    hairStyles: [hair(choices[0]), hair(choices[1]), hair(choices[2])],
    eyewear: {
      classic: asset("classic", "frame", "#3B3935"), round: asset("round", "frame", "#3B3935"),
      square: asset("square", "frame", "#3B3935"),
    },
    materials,
  };
}

const catalog = (Object.keys(AVATAR_FAMILY_STYLES) as AvatarFamilyId[]).map(fixture);

test("all four families are independent, with three hairstyles and four eyewear states", () => {
  let combinations = 0;
  for (const family of catalog) {
    const old = normalizeAvatarConfig({ style: family.style, glasses: true, portraitVersion: "v2-tone", hairColor: "dark", glassesStyle: "square", eyewearVersion: "v1", pet: "eagle", background: "mint", materialColors: { hair: "#745182", skin: "#885139", frame: "#B88E55" } });
    const selected = selectAvatarPortraitFamily(old, family.id, catalog);
    assert.equal(getAvatarPortraitOptions(selected, catalog)?.families.length, 2);
    assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(selected))), selected);
    assert.deepEqual(selectAvatarPortraitVersion(selected, false, catalog), old);
    assert.equal(getAvatarPortraitPlan(selected, []).portrait, AVATAR_CLASSIC_DARK_PORTRAITS[family.style].plain);
    for (const hair of family.hairStyles) {
      for (const style of ["none", "classic", "round", "square"] as const) {
        const next = selectAvatarFamilyGlasses(selectAvatarFamilyHair(selected, hair.value, catalog), style, catalog);
        const plan = getAvatarPortraitPlan(next, catalog);
        assert.equal(plan.portrait, family.faceBody);
        assert.deepEqual(plan.layers.map(layer => layer.kind), style === "none"
          ? ["hair-back", "face-body", "hair-front"] : ["hair-back", "face-body", "eyewear", "hair-front"]);
        for (const layer of plan.layers) {
          assert.ok(layer.src.includes(`/test-${family.id}/`));
          const registered = getAvatarLayerMaterial(layer.src, catalog);
          assert.ok(registered);
          const colorPlan = getAvatarMaterialPlan(layer.src, next.materialColors, catalog);
          assert.ok(colorPlan);
          assert.equal(colorPlan.coverageUri, registered.coverageUri);
          assert.equal(colorPlan.channels.length, 1);
          assert.equal(colorPlan.channels[0].part, registered.part);
          assert.equal(colorPlan.frameGuard, false);
          assert.equal(getAvatarMaterialPlan(layer.src, {}, catalog), null);
        }
        assert.deepEqual(getAvatarMaterialChannels(next, catalog).map(part => part.part), style === "none" ? ["hair", "skin"] : ["hair", "skin", "frame"]);
        assert.deepEqual(next.materialColors, old.materialColors);
        assert.equal(next.portraitVersion, old.portraitVersion);
        assert.equal(next.hairColor, old.hairColor);
        assert.equal(next.eyewearVersion, old.eyewearVersion);
        assert.equal(next.glassesStyle, old.glassesStyle);
        assert.equal(next.pet, old.pet);
        assert.equal(next.background, old.background);
        for (const displayMode of ["name", "default"] as const) {
          const hidden = normalizeAvatarConfig({ ...next, displayMode });
          assert.deepEqual(getAvatarPortraitPlan(hidden, catalog), { portrait: null, layers: [] });
          assert.deepEqual(hidden.portraitFamily, next.portraitFamily);
        }
        combinations++;
      }
    }
  }
  assert.equal(combinations, 48);
});

test("a previously saved dormant v3 version or hairstyle cannot activate a new family", () => {
  for (const style of ["masculine", "feminine"] as const) {
    for (const version of [undefined, "v3"] as const) {
      const legacy = normalizeAvatarConfig({ style, portraitVersion: version, hair: "bun", glasses: true, glassesStyle: "round" });
      assert.equal(getAvatarPortraitOptions(legacy, catalog)?.active, false);
      assert.equal(getAvatarPortraitPlan(legacy, catalog).portrait, AVATAR_PORTRAITS[style].glasses);
      assert.equal(getAvatarEyewearPlan(legacy), null);
    }
  }
});

test("unknown, mismatched and inherited family IDs do not select art", () => {
  for (const value of [
    { id: "unknown" }, { id: "female-b" }, { id: "__proto__" },
    { id: "/avatar/scenes/v3/test-male-a/face.webp" },
    Object.create({ id: "male-a" }), ["male-a"], null,
  ]) {
    const avatar = normalizeAvatarConfig({ style: "masculine", portraitFamily: value });
    assert.equal(avatar.portraitFamily, undefined);
    assert.equal(getAvatarPortraitPlan(avatar, catalog).portrait, AVATAR_PORTRAITS.masculine.plain);
  }
  const old = normalizeAvatarConfig({ style: "masculine" });
  assert.equal(selectAvatarPortraitFamily(old, "female-a", catalog), old);
  const future = normalizeAvatarConfig({ ...old, portraitFamily: { id: "male-b", hair: "short", glassesStyle: "square" } });
  assert.equal(getAvatarPortraitOptions(future, [catalog[0]])?.active, false);
  assert.equal(getAvatarPortraitPlan(future, [catalog[0]]).portrait, AVATAR_PORTRAITS.masculine.plain);
  assert.equal(getAvatarPortraitPlan(future).portrait, AVATAR_PORTRAITS.masculine.plain);
});

test("switching within one gender uses only compatible hair/frame choices and exact colors", () => {
  const old: AvatarConfig = normalizeAvatarConfig({ style: "feminine", glasses: true, materialColors: { hair: "#ABCDEF", skin: "#BC855E", frame: "#654539" } });
  const a = selectAvatarPortraitFamily(old, "female-a", catalog);
  const b = selectAvatarPortraitFamily(selectAvatarFamilyHair(a, "bun", catalog), "female-b", catalog);
  assert.equal(b.portraitFamily?.id, "female-b");
  assert.equal(b.portraitFamily?.hair, "bun");
  assert.deepEqual(b.materialColors, old.materialColors);
  assert.equal(selectAvatarFamilyHair(b, "short", catalog), b);
  assert.equal(getAvatarLayerMaterial("https://example.invalid/avatar/scenes/v3/test-female-a/face.webp", catalog), null);
  assert.equal(getAvatarLayerMaterial("/avatar/scenes/v3/test-female-a/face.webp?other=1", catalog), null);
  assert.equal(getAvatarMaterialPlan("/avatar/scenes/v3/unregistered/face.webp", b.materialColors, catalog), null);
});
