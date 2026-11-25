import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { normalizeAvatarConfig, AVATAR_DEFAULTS } from "../lib/profile/avatar.ts";
import { AVATAR_HAIRSTYLES, getAvatarHairstyleOptions, selectAvatarHairstyle, getAvatarHairstyle, type AvatarHairstyleId } from "../lib/profile/avatar-hairstyle.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import { getAvatarEyewearPlan, selectAvatarLegacyEyewear } from "../lib/profile/avatar-eyewear.ts";
import { getAvatarMaterialChannels, getAvatarMaterialPlan, setAvatarMaterialColor } from "../lib/profile/avatar-materials.ts";
import { AVATAR_CLASSIC_DARK_PORTRAITS, AVATAR_PORTRAITS, selectClassicHairTone } from "../lib/profile/avatar-portrait.ts";

test("registered hairstyle artwork and its mask are pinned, transparent 512px and within budget", () => {
  assert.equal(AVATAR_HAIRSTYLES.length, 4);
  assert.equal(getAvatarHairstyleOptions("neutral").length, 0);
  for (const style of ["masculine", "feminine"] as const) assert.equal(getAvatarHairstyleOptions(style).length, 2);
  for (const source of AVATAR_HAIRSTYLES) {
    const bytes = fs.readFileSync(path.join(process.cwd(), "public", source.src.slice(1)));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 16), "WEBPVP8X");
    assert.ok((bytes[20] & 0x10) !== 0);
    assert.equal(bytes.readUIntLE(24, 3) + 1, 512);
    assert.equal(bytes.readUIntLE(27, 3) + 1, 512);
    assert.ok(bytes.length < 180 * 1024);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sourceSha256);
    const mask = fs.readFileSync(path.join(process.cwd(), "public", source.coverageUri.slice(1)));
    assert.equal(mask.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(mask.readUInt32BE(16), 512);
    assert.equal(mask.readUInt32BE(20), 512);
    assert.ok(mask.length < 64 * 1024);
    assert.equal(createHash("sha256").update(mask).digest("hex"), source.coverageSha256);
  }
});

test("explicit hairstyle selection round-trips, keeps all colors and restores the legacy source", () => {
  for (const source of AVATAR_HAIRSTYLES) {
    const old = normalizeAvatarConfig({ ...selectClassicHairTone(AVATAR_DEFAULTS[source.style], "dark"), glasses: true, eyewearVersion: "v1", glassesStyle: "square", pet: "eagle", background: "mint", materialColors: { hair: "#80618F", skin: "#A96A48", frame: "#B88E55" } });
    const selected = selectAvatarHairstyle(old, source.id);
    assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(selected))), selected);
    assert.equal(getAvatarScene(selected).portrait, source.src);
    assert.deepEqual(getAvatarScene(selected).portraitLayers, [{ kind: "hairstyle", src: source.src }]);
    assert.deepEqual(selected.materialColors, old.materialColors);
    assert.equal(selected.portraitVersion, "v2-tone");
    assert.equal(selected.pet, "eagle");
    assert.equal(selected.background, "mint");
    assert.deepEqual(selectAvatarHairstyle(selected, "original"), old);
    assert.equal(getAvatarScene(selectAvatarHairstyle(selected, "original")).portrait, AVATAR_CLASSIC_DARK_PORTRAITS[source.style].plain);
    for (const choice of ["none", "classic", "round", "square"] as const) {
      const withFrame = selectAvatarLegacyEyewear(selected, choice);
      const saved = normalizeAvatarConfig(JSON.parse(JSON.stringify(withFrame)));
      assert.equal(getAvatarScene(saved).portrait, source.src);
      assert.equal(getAvatarEyewearPlan(saved)?.choice ?? "none", choice);
      assert.equal(getAvatarEyewearPlan(saved)?.occlusionUri, choice === "none" ? undefined : source.coverageUri);
      assert.deepEqual(getAvatarMaterialChannels(saved).map(c => c.part), choice === "none" ? ["hair", "skin"] : ["hair", "skin", "frame"]);
      const plan = getAvatarMaterialPlan(source.src, saved.materialColors);
      assert.ok(plan);
      assert.equal(plan.coverageUri, source.coverageUri);
      assert.deepEqual(plan.channels.map(c => c.part), ["hair", "skin"]);
      assert.equal(getAvatarMaterialPlan(source.src, { frame: "#FF0000" }), null);
      assert.equal(getAvatarMaterialPlan(source.src, {}), null);
      const reset = setAvatarMaterialColor(saved, "hair", null);
      assert.deepEqual(reset.materialColors, { skin: "#A96A48", frame: "#B88E55" });
      assert.deepEqual(getAvatarMaterialPlan(source.src, reset.materialColors)?.channels.map(c => c.part), ["skin"]);
      for (const displayMode of ["name", "default"] as const) {
        const hidden = normalizeAvatarConfig({ ...saved, displayMode });
        assert.equal(getAvatarScene(hidden).portrait, null);
        assert.equal(getAvatarEyewearPlan(hidden), null);
        assert.equal(getAvatarHairstyle(hidden)?.id, source.id);
      }
    }
  }
});

test("old hair fields and invalid or mismatched variant IDs cannot activate new artwork", () => {
  for (const variant of [undefined, "female-bob", "unknown", "__proto__", "https://example.invalid/a.webp", { id: "male-short" }]) {
    const old = normalizeAvatarConfig({ style: "masculine", hair: "short", hairstyleVariant: variant, glasses: true });
    assert.equal(old.hairstyleVariant, undefined);
    assert.equal(getAvatarScene(old).portrait, AVATAR_PORTRAITS.masculine.glasses);
    assert.equal(getAvatarHairstyle(old), null);
    assert.equal(getAvatarEyewearPlan(old), null);
  }
  const neutral = normalizeAvatarConfig({ style: "neutral", hairstyleVariant: "male-short" });
  assert.equal(neutral.hairstyleVariant, undefined);
  const old = normalizeAvatarConfig({ style: "masculine" });
  assert.equal(selectAvatarHairstyle(old, "female-bob"), old);
  assert.equal(selectAvatarHairstyle(old, "not-registered" as AvatarHairstyleId), old);
});
