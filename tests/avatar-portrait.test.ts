import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeAvatarConfig } from "../lib/profile/avatar.ts";
import {
  AVATAR_LAYERED_PORTRAITS,
  AVATAR_PORTRAITS,
  getAvatarPortraitOptions,
  getAvatarPortraitPlan,
  selectAvatarPortraitVersion,
  type AvatarPortraitFamily,
} from "../lib/profile/avatar-portrait.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";

// Deliberately test-only paths: the mock catalog never reaches the production renderer.
const family = {
  style: "masculine",
  faceBody: "/avatar/scenes/v3/test/face.webp",
  hairStyles: [
    { value: "side", label: "側分", colors: [
      { value: "dark", label: "黑色", front: "/avatar/scenes/v3/test/side-dark.webp" },
      { value: "brown", label: "深棕", front: "/avatar/scenes/v3/test/side-brown.webp" },
    ] },
    { value: "wave", label: "微捲", colors: [
      { value: "brown", label: "深棕", back: "/avatar/scenes/v3/test/wave-back.webp", front: "/avatar/scenes/v3/test/wave-front.webp" },
    ] },
  ],
  eyewear: {
    classic: "/avatar/scenes/v3/test/classic.webp",
    round: "/avatar/scenes/v3/test/round.webp",
  },
} as const satisfies AvatarPortraitFamily;
const catalog = [family];

test("legacy portraits stay identical even after future catalog registration", () => {
  for (const style of ["masculine", "feminine"] as const) {
    for (const glasses of [false, true]) {
      const old = normalizeAvatarConfig({ style, glasses, hair: "wave", hairColor: "gray", pet: "sheep" });
      const asset = AVATAR_PORTRAITS[style][glasses ? "glasses" : "plain"];
      assert.deepEqual(getAvatarPortraitPlan(old, catalog), {
        portrait: asset, layers: [{ kind: "legacy", src: asset }],
      });
      assert.deepEqual(getAvatarScene(old).portraitLayers, [{ kind: "legacy", src: asset }]);
    }
  }
});

test("explicit v3 opt-in composes actual compatible layers in fixed order", () => {
  const old = normalizeAvatarConfig({ style: "masculine", hair: "wave", hairColor: "dark", glasses: true, glassesStyle: "round", pet: "eagle", iconType: "church", iconTone: "blue" });
  const next = selectAvatarPortraitVersion(old, true, catalog);
  assert.equal(next.portraitVersion, "v3");
  assert.equal(next.hairColor, "brown"); // only available color for this hair
  assert.equal(next.pet, "eagle");
  assert.equal(next.iconType, "church");
  assert.equal(next.iconTone, "blue");
  assert.deepEqual(getAvatarPortraitPlan(next, catalog).layers, [
    { kind: "hair-back", src: "/avatar/scenes/v3/test/wave-back.webp" },
    { kind: "face-body", src: family.faceBody },
    { kind: "eyewear", src: family.eyewear.round },
    { kind: "hair-front", src: "/avatar/scenes/v3/test/wave-front.webp" },
  ]);
  const noGlasses = getAvatarPortraitPlan({ ...next, glasses: false }, catalog);
  assert.equal(noGlasses.layers.some((layer) => layer.kind === "eyewear"), false);
  assert.equal(getAvatarPortraitPlan(selectAvatarPortraitVersion(next, false, catalog), catalog).portrait, AVATAR_PORTRAITS.masculine.glasses);
});

test("missing families and incompatible features never point to nonexistent artwork", () => {
  const avatar = normalizeAvatarConfig({ style: "masculine", portraitVersion: "v3", hair: "bun", hairColor: "gray", glasses: true, glassesStyle: "square" });
  assert.equal(getAvatarPortraitOptions(avatar, []) , null);
  assert.equal(getAvatarPortraitPlan(avatar, []).portrait, AVATAR_PORTRAITS.masculine.glasses);
  const opts = getAvatarPortraitOptions(avatar, catalog);
  assert.ok(opts);
  assert.equal(opts.hair.value, "side");
  assert.equal(opts.color.value, "dark");
  assert.deepEqual(opts.glassesStyles, ["classic", "round"]);
  assert.equal(opts.glassesStyle, "classic");
  assert.equal(getAvatarPortraitPlan(avatar, catalog).layers.find((layer) => layer.kind === "eyewear")?.src, family.eyewear.classic);
  const neutral = normalizeAvatarConfig({ style: "neutral", portraitVersion: "v3", glasses: true });
  assert.equal(getAvatarPortraitPlan(neutral, catalog).portrait, null);
  for (const displayMode of ["default", "name"] as const) {
    assert.deepEqual(getAvatarPortraitPlan({ ...avatar, displayMode }, catalog), { portrait: null, layers: [] });
  }
  const female = normalizeAvatarConfig({ style: "feminine", glasses: false });
  assert.deepEqual(selectAvatarPortraitVersion(female, true, catalog), female);
});

test("all registered P2 layers are real transparent 512px WebP assets within the mobile budget", () => {
  const styles = new Set<string>();
  for (const item of AVATAR_LAYERED_PORTRAITS) {
    assert.equal(styles.has(item.style), false, "only one approved family per style");
    styles.add(item.style);
    assert.ok(item.hairStyles.length > 0);
    const hairValues = new Set<string>();
    const assets = new Set<string>([item.faceBody, ...Object.values(item.eyewear).filter((src): src is NonNullable<typeof src> => Boolean(src))]);
    assert.ok(item.eyewear.classic);
    for (const hair of item.hairStyles) {
      assert.equal(hairValues.has(hair.value), false, "duplicate hairstyle");
      hairValues.add(hair.value);
      const colors = new Set<string>();
      assert.ok(hair.colors.length > 0);
      for (const color of hair.colors) {
        assert.equal(colors.has(color.value), false, "duplicate color");
        colors.add(color.value);
        if (color.back) assets.add(color.back);
        assets.add(color.front);
      }
    }
    for (const src of assets) {
      assert.match(src, /^\/avatar\/scenes\/v3\/[a-z0-9/_-]+\.webp$/);
      const bytes = fs.readFileSync(path.join(process.cwd(), "public", src.slice(1)));
      assert.equal(bytes.toString("ascii", 0, 4), "RIFF", src);
      assert.equal(bytes.toString("ascii", 8, 12), "WEBP", src);
      assert.equal(bytes.toString("ascii", 12, 16), "VP8X", src);
      assert.ok((bytes[20] & 0x10) !== 0, src);
      assert.equal(bytes.readUIntLE(24, 3) + 1, 512, src);
      assert.equal(bytes.readUIntLE(27, 3) + 1, 512, src);
      assert.ok(bytes.length < 180 * 1024, `${src}: artwork exceeds mobile budget`);
    }
  }
});
