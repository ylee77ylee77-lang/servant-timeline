#!/usr/bin/env node
/**
 * Offline raster proof for the actual React SVG material filter.
 * Run with Node 22+:
 *   node --experimental-strip-types scripts/verify-avatar-material-rendering.mjs [output-directory]
 *
 * Uses the repository's existing TypeScript, React and Sharp installations.
 * This is a librsvg rendering check, not browser/iPhone or visual acceptance.
 * All generated files stay outside public/ and no network access is used.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import sharp from "sharp";
import { avatarMaterialTransfer, getAvatarMaterialPlan, getAvatarMaterialSource } from "../lib/profile/avatar-materials.ts";
import { AVATAR_FRAME_PATHS } from "../lib/profile/avatar-frame-paths.ts";
import { AVATAR_FEATURE_PATHS } from "../lib/profile/avatar-feature-paths.ts";
import { createAvatarMaterialMask } from "./build-avatar-material-masks.mjs";
import { refineCandidateMaterial } from "./refine-avatar-candidate-materials.mjs";
import { verifyIndependentHairstyles } from "./verify-independent-avatar-hairstyles.mjs";
import { makeVariantMask } from "./build-avatar-hairstyle-candidate-masks.mjs";
import { verifyIndependentEyewear } from "./verify-independent-avatar-eyewear.mjs";
import { verifyIndependentOutfits } from "./verify-independent-avatar-outfits.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZE = 512;
const CHANNELS = { hair: 0, skin: 1, frame: 2 };
const SOURCE_HASHES = {
  "/avatar/scenes/v2/male.webp": "7f9899e7024c6090692585ba2fd26fd1430c2760b4d6b531d20ac5e1c7f36e59",
  "/avatar/scenes/v2/male-glasses.webp": "ff9d0e8c53fc5f1168d9e9cc40ebb0f040dc2154225a06a5c99e1364a9ba3cc5",
  "/avatar/scenes/v2/female.webp": "e95c91cfd17ebc4965c8acfc74d8d4d19d787a5b91a99c46c425221f17b126a2",
  "/avatar/scenes/v2/female-glasses.webp": "a14b3ce493f0d161cd6257d8f334531bc921bc341cf45a46481695ffee80bfb0",
  "/avatar/scenes/v2-tones/male-dark.webp": "9a6089d396f8223cdf2a53dfa0b2e7ce8b820892c1fdc2d377fc43bf6da6f07c",
  "/avatar/scenes/v2-tones/male-dark-glasses.webp": "1a1d90c455e0af0dbf8466fe506ba04880435888481351e62c0c347d98db4a1a",
  "/avatar/scenes/v2-tones/female-dark.webp": "1cfe3de969b0cefb6273d855b0042975dba9d6f9488c28414139b79def9cb4b7",
  "/avatar/scenes/v2-tones/female-dark-glasses.webp": "bc058ce99e0c0627cfc18f5fb77687672ed9e9b1e13fd5699aa779fe212c659a",
};
const CASES = [
  { name: "hair-black", colors: { hair: "#000000" } },
  { name: "hair-white", colors: { hair: "#FFFFFF" } },
  { name: "hair-violet", colors: { hair: "#A06EE8" } },
  { name: "skin-light", colors: { skin: "#F5D7BD" } },
  { name: "skin-deep", colors: { skin: "#885139" } },
  { name: "frame-gold", colors: { frame: "#B88E55" } },
  { name: "frame-blue", colors: { frame: "#496C94" } },
  { name: "combined", colors: { hair: "#654539", skin: "#BC855E", frame: "#B88E55" } },
];
// Interior source landmarks, checked as 3x3 patches, not just isolated pixels.
const PROTECTED_POINTS = {
  male: [
    { name: "left-eye", x: 210, y: 202 }, { name: "right-eye", x: 308, y: 201 },
    { name: "teeth", x: 250, y: 291 },
    { name: "clothing-center", x: 255, y: 471 }, { name: "clothing-left", x: 125, y: 420 },
    { name: "clothing-right", x: 399, y: 454 },
  ],
  female: [
    { name: "left-eye", x: 217, y: 219 }, { name: "right-eye", x: 313, y: 210 },
    { name: "teeth", x: 260, y: 304 },
    { name: "clothing-center", x: 280, y: 480 }, { name: "clothing-right", x: 350, y: 475 },
  ],
};

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const dataUri = (bytes) => `data:image/png;base64,${bytes.toString("base64")}`;
const imageIndex = (x, y) => (y * SIZE + x) * 4;

async function rgba(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [SIZE, SIZE, 4], "Expected a 512x512 RGBA image");
  return data;
}

function pixelDelta(a, b, offset) {
  return Math.max(...[0, 1, 2].map((channel) => Math.abs(a[offset + channel] - b[offset + channel])));
}

function rasterStats(original, changed, coverage, parts) {
  const stats = {
    maxAlphaDelta: 0, outsidePixels: 0, opaqueOutsidePixels: 0, opaqueOutsideChanged: 0,
    maxOutsidePremultipliedDelta: 0, visibleChangedPixels: 0,
    targetChangedPixels: Object.fromEntries(parts.map((part) => [part, 0])),
    firstOpaqueOutsideChange: null,
  };
  for (let offset = 0; offset < original.length; offset += 4) {
    const alpha = original[offset + 3];
    const nextAlpha = changed[offset + 3];
    stats.maxAlphaDelta = Math.max(stats.maxAlphaDelta, Math.abs(alpha - nextAlpha));
    const delta = pixelDelta(original, changed, offset);
    const selected = parts.some((part) => coverage[offset + CHANNELS[part]] > 0);
    if (alpha > 32 && delta > 3) {
      stats.visibleChangedPixels++;
      for (const part of parts) {
        if (coverage[offset + CHANNELS[part]] > 0) stats.targetChangedPixels[part]++;
      }
    }
    if (selected || alpha === 0) continue;
    stats.outsidePixels++;
    if (alpha === 255) {
      stats.opaqueOutsidePixels++;
      if (delta !== 0) {
        stats.opaqueOutsideChanged++;
        stats.firstOpaqueOutsideChange ??= { x: (offset / 4) % SIZE, y: Math.floor(offset / 4 / SIZE), delta };
      }
    }
    for (let channel = 0; channel < 3; channel++) {
      const before = Math.round(original[offset + channel] * alpha / 255);
      const after = Math.round(changed[offset + channel] * nextAlpha / 255);
      stats.maxOutsidePremultipliedDelta = Math.max(stats.maxOutsidePremultipliedDelta, Math.abs(before - after));
    }
  }
  return stats;
}

function checkProtectedPatches(original, changed, coverage, parts, points, prefix, failures) {
  let checked = 0;
  for (const point of points) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const offset = imageIndex(point.x + dx, point.y + dy);
        const label = `${prefix}:${point.name ?? `${point.x},${point.y}`} (${point.x + dx},${point.y + dy})`;
        if (original[offset + 3] < 200) failures.push(`${label}: protected landmark is not on visible source artwork`);
        if (parts.some((part) => coverage[offset + CHANNELS[part]] > 0)) {
          failures.push(`${label}: selected coverage enters protected landmark`);
        }
        // Source images are mostly alpha 253. Unpremultiplication may differ by
        // one RGB step; the global comparison additionally bounds premultiplied RGB.
        if (pixelDelta(original, changed, offset) > 2 || Math.abs(original[offset + 3] - changed[offset + 3]) > 1) {
          failures.push(`${label}: protected source pixel changed`);
        }
        checked++;
      }
    }
  }
  return checked;
}

function checkFeatureSamples(original, changed, coverage, features, failures) {
  const checked = { protected: 0, skin: 0, frameOccluded: 0 };
  // These are exact feature centers. Do not expand a brow sample into a strict
  // patch: skin between its fine hairs intentionally receives partial coverage.
  for (const point of features.protectedPoints) {
    const offset = imageIndex(point.x, point.y);
    if (coverage[offset + CHANNELS.skin] !== 0) failures.push(`Feature center (${point.x},${point.y}) receives skin coverage`);
    if (pixelDelta(original, changed, offset) > 2) failures.push(`Protected feature center (${point.x},${point.y}) changed with skin color`);
    checked.protected++;
  }
  for (const point of features.skinPoints) {
    const offset = imageIndex(point.x, point.y);
    if (coverage[offset + CHANNELS.frame] > 0) {
      checked.frameOccluded++;
      continue;
    }
    if (coverage[offset + CHANNELS.skin] < 128) failures.push(`Visible eyelid/brow-adjacent skin (${point.x},${point.y}) lacks skin coverage`);
    if (pixelDelta(original, changed, offset) <= 3) failures.push(`Visible eyelid/brow-adjacent skin (${point.x},${point.y}) did not tint`);
    checked.skin++;
  }
  return checked;
}

async function writeContactSheet(output, rows) {
  const tileSize = 160;
  const columnWidth = 168;
  const rowHeight = 204;
  const labels = ["original", ...CASES.map((item) => item.name)];
  const layers = [];
  for (const [row, name] of rows.entries()) {
    for (const [column, label] of labels.entries()) {
      const tile = await sharp(path.join(output, `${name}-${label}.png`))
        .resize(tileSize, tileSize).flatten({ background: "#F4F1F8" }).png().toBuffer();
      const text = Buffer.from(`<svg width="168" height="36"><text x="4" y="13" font-size="10" font-family="sans-serif" fill="#484151">${name}</text><text x="4" y="29" font-size="11" font-family="sans-serif" fill="#484151">${label}</text></svg>`);
      layers.push({ input: text, left: column * columnWidth, top: row * rowHeight });
      layers.push({ input: tile, left: column * columnWidth + 4, top: row * rowHeight + 36 });
    }
  }
  await sharp({ create: { width: labels.length * columnWidth, height: rows.length * rowHeight, channels: 3, background: "#F4F1F8" } })
    .composite(layers).png().toFile(path.join(output, "contact-sheet.png"));
}

function createComponentLoader() {
  const cache = new Map();
  function load(filename) {
    const entry = path.resolve(filename);
    assert.ok(entry.startsWith(`${ROOT}${path.sep}`), "Component loader must stay inside this repository");
    if (cache.has(entry)) return cache.get(entry).exports;
    const compiled = ts.transpileModule(readFileSync(entry, "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal(compiled.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error).length, 0, `${entry}: TSX transpilation failed`);
    const loadedModule = { exports: {} };
    cache.set(entry, loadedModule);
    const nativeRequire = createRequire(entry);
    function localRequire(specifier) {
      if (!specifier.startsWith("@/") && !specifier.startsWith(".")) return nativeRequire(specifier);
      const requested = specifier.startsWith("@/") ? path.join(ROOT, specifier.slice(2)) : path.resolve(path.dirname(entry), specifier);
      const resolved = [requested, `${requested}.tsx`, `${requested}.ts`].find((candidate) => existsSync(candidate));
      assert.ok(resolved && /\.tsx?$/.test(resolved), `Unsupported local component import: ${specifier}`);
      return load(resolved);
    }
    // Only transpiled checked-in source is executed, never profile strings.
    new Function("require", "exports", "module", compiled.outputText)(localRequire, loadedModule.exports, loadedModule);
    return loadedModule.exports;
  }
  return load;
}

async function verifySharedRenderer(output, loadComponent) {
  const { AvatarRenderer } = loadComponent(path.join(ROOT, "components/profile/AvatarRenderer.tsx"));
  const { normalizeAvatarConfig } = loadComponent(path.join(ROOT, "lib/profile/avatar.ts"));
  const { AVATAR_PORTRAIT_BOUNDS } = loadComponent(path.join(ROOT, "lib/profile/avatar-scene.ts"));
  const sizes = [48, 80, 104, 256];
  const fixtures = [
    { name: "male", style: "masculine", materialColors: { hair: "#A06EE8", skin: "#BC855E", frame: "#B88E55" } },
    { name: "female", style: "feminine", materialColors: { hair: "#AC9E98", skin: "#885139", frame: "#496C94" } },
  ];
  const assets = new Map();
  async function embedAssets(markup) {
    let svg = markup.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
    const hrefs = [...new Set([...svg.matchAll(/\b(?:href|xlink:href)="([^"]+)"/g)].map((match) => match[1]))];
    for (const href of hrefs) {
      assert.match(href, /^\/avatar\/[a-z0-9/_-]+\.(?:png|webp)$/, "Only registered local avatar raster assets may be embedded");
      if (!assets.has(href)) assets.set(href, dataUri(await sharp(await fs.readFile(path.join(ROOT, "public", href))).png().toBuffer()));
      svg = svg.split(`href="${href}"`).join(`href="${assets.get(href)}"`);
    }
    for (const match of svg.matchAll(/\b(?:href|xlink:href)="([^"]+)"/g)) assert.match(match[1], /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    for (const match of svg.matchAll(/url\(([^)]+)\)/g)) assert.match(match[1], /^#[A-Za-z0-9_:-]+$/, "SVG resource references must stay inside the document");
    return Buffer.from(svg);
  }
  // Exercise the actual shared renderer, not a separate candidate compositor.
  const {getAvatarIndependentOptions,selectAvatarIndependent}=loadComponent(path.join(ROOT,"lib/profile/avatar-independent.ts"));
  const {getAvatarOutfitOptions,selectAvatarFormalOutfit}=loadComponent(path.join(ROOT,"lib/profile/avatar-formal-outfit.ts"));
  const {selectAvatarLegacyEyewear}=loadComponent(path.join(ROOT,"lib/profile/avatar-eyewear.ts"));
  const b1Cases=[],b1Tiles=[];
  async function renderB1(config,size){
    const svg=await embedAssets(renderToStaticMarkup(React.createElement(AvatarRenderer,{config,size})));
    const png=await sharp(svg).png().toBuffer();
    const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.deepEqual([info.width,info.height,info.channels],[size,size,4]);
    return {png,data};
  }
  let b1Row=0;
  for(const style of ["masculine","feminine"]){
    for(const source of getAvatarIndependentOptions(style)){
      const base=selectAvatarIndependent(normalizeAvatarConfig({style,background:"sky",materialColors:{hair:"#654539",skin:"#986448",frame:"#B88E55"}}),source.id);
      const framed=selectAvatarLegacyEyewear(base,"round");
      const choices=getAvatarOutfitOptions(style);
      for(const size of sizes){
        const reference=await renderB1(framed,size);
        if(size===256)b1Tiles.push({input:reference.png,left:0,top:b1Row*256});
        for(const [col,choice] of choices.entries()){
          const selected=selectAvatarFormalOutfit(framed,choice.id);
          const reopened=normalizeAvatarConfig(JSON.parse(JSON.stringify(selected)));
          assert.deepEqual(reopened,selected);
          const result=await renderB1(reopened,size);
          let changed=0;
          for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const i=(y*size+x)*4,sy=((y+.5)*512/size-AVATAR_PORTRAIT_BOUNDS.y)*512/AVATAR_PORTRAIT_BOUNDS.size;
            const margin=3*512/size*512/AVATAR_PORTRAIT_BOUNDS.size;
            assert.ok(Math.abs(reference.data[i+3]-result.data[i+3])<=1,source.id+": alpha");
            if(sy<390-margin)assert.ok(pixelDelta(reference.data,result.data,i)<=2,source.id+"/"+choice.id+"/"+size+": head changed");
            if(pixelDelta(reference.data,result.data,i)>8)changed++;
          }
          assert.ok(changed>0,source.id+"/"+choice.id+"/"+size+": outfit not visible");
          b1Cases.push({source:source.id,outfit:choice.id,size,changed});
          if(size===256)b1Tiles.push({input:result.png,left:(col+1)*256,top:b1Row*256});
        }
      }
      b1Row++;
    }
  }
  assert.equal(b1Cases.length,120);
  await sharp({create:{width:1536,height:1536,channels:3,background:"#F4F1F8"}}).composite(b1Tiles).png().toFile(path.join(output,"independent-shared-renderer-review.png"));
  console.log("INDEPENDENT_SHARED_RENDERER_PROOF "+JSON.stringify({cases:b1Cases.length,visualAcceptance:"NOT_APPROVED"}));
  const results = [];
  const strip = [];
  const widths = [88, 120, 144, 288];
  for (const [row, fixture] of fixtures.entries()) {
    for (const [column, size] of sizes.entries()) {
      const config = normalizeAvatarConfig({ style: fixture.style, glasses: true, pet: "sheep", background: "sky", materialColors: fixture.materialColors });
      const baselineConfig = { ...config };
      delete baselineConfig.materialColors;
      const rendered = [];
      for (const [label, avatar] of [["original", baselineConfig], ["colored", config]]) {
        const svg = await embedAssets(renderToStaticMarkup(React.createElement(AvatarRenderer, { config: avatar, size })));
        const png = await sharp(svg).png().toBuffer();
        const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual([info.width, info.height, info.channels], [size, size, 4], "Shared renderer output dimensions changed");
        const filename = `${fixture.name}-shared-${label === "original" ? "original-" : ""}${size}.png`;
        await fs.writeFile(path.join(output, filename), png);
        rendered.push({ data, png, filename });
      }
      const [baseline, colored] = rendered;
      let opaque = 0, transparent = 0, changedPixels = 0, maxAlphaDelta = 0;
      for (let offset = 0; offset < colored.data.length; offset += 4) {
        if (colored.data[offset + 3] === 255) opaque++;
        if (colored.data[offset + 3] === 0) transparent++;
        if (pixelDelta(baseline.data, colored.data, offset) > 8) changedPixels++;
        maxAlphaDelta = Math.max(maxAlphaDelta, Math.abs(baseline.data[offset + 3] - colored.data[offset + 3]));
      }
      assert.ok(opaque > size * size / 2 && transparent > 0, `${fixture.name}/${size}: shared renderer is blank or lost its transparent circular boundary`);
      assert.ok(changedPixels > size * size * .03, `${fixture.name}/${size}: material colors did not reach the placed portrait`);
      assert.ok(maxAlphaDelta <= 1, `${fixture.name}/${size}: material edits changed scene alpha`);
      function sourcePointDelta(point) {
        const x = Math.floor((AVATAR_PORTRAIT_BOUNDS.x + point.x / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
        const y = Math.floor((AVATAR_PORTRAIT_BOUNDS.y + point.y / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
        return pixelDelta(baseline.data, colored.data, (y * size + x) * 4);
      }
      const hairDelta = sourcePointDelta({ x: 280, y: 55 });
      const skinDelta = sourcePointDelta({ x: 280, y: 260 });
      assert.ok(hairDelta > 8 && skinDelta > 8, `${fixture.name}/${size}: colors missed expected hair/skin locations after portrait placement`);
      if (size >= 104) {
        for (const point of PROTECTED_POINTS[fixture.name].slice(0, 2)) {
          assert.ok(sourcePointDelta(point) <= 3, `${fixture.name}/${size}: placed color coverage entered a protected eye center`);
        }
      }
      results.push({ fixture: fixture.name, size, file: colored.filename, reference: baseline.filename, opaquePixels: opaque, transparentPixels: transparent, changedPixels, maxAlphaDelta, hairDelta, skinDelta, passed: true });
      const left = widths.slice(0, column).reduce((total, width) => total + width, 0);
      strip.push({ input: Buffer.from(`<svg width="${widths[column]}" height="24"><text x="6" y="17" font-size="11" font-family="sans-serif" fill="#484151">${fixture.name} · ${size}px</text></svg>`), left, top: row * 292 });
      strip.push({ input: colored.png, left: left + Math.floor((widths[column] - size) / 2), top: row * 292 + 28 + Math.floor((256 - size) / 2) });
    }
  }
  await sharp({ create: { width: widths.reduce((a, b) => a + b, 0), height: 584, channels: 3, background: "#F4F1F8" } }).composite(strip).png().toFile(path.join(output, "shared-renderer-strip.png"));
  const eyewearCases = [], eyewearSheet = [];
  const { selectAvatarLegacyEyewear } = loadComponent(path.join(ROOT, "lib/profile/avatar-eyewear.ts"));
  async function renderEyewear(config, size) {
    const svg = await embedAssets(renderToStaticMarkup(React.createElement(AvatarRenderer, { config, size })));
    const png = await sharp(svg).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height, info.channels], [size, size, 4]);
    return { data, png };
  }
  for (const [row, fixture] of fixtures.entries()) {
    const base = normalizeAvatarConfig({ style: fixture.style, background: "sky", glasses: false, materialColors: { hair: "#654539", skin: "#BC855E" } });
    for (const size of sizes) {
      const plain = await renderEyewear(base, size);
      for (const [column, choice] of ["round", "square"].entries()) {
        const selected = selectAvatarLegacyEyewear(base, choice);
        const original = await renderEyewear(selected, size);
        const colored = await renderEyewear({ ...selected, materialColors: { ...base.materialColors, frame: choice === "round" ? "#B88E55" : "#496C94" } }, size);
        let added = 0, tinted = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const offset = (y * size + x) * 4;
          const sx = (x * SIZE / size - AVATAR_PORTRAIT_BOUNDS.x) * SIZE / AVATAR_PORTRAIT_BOUNDS.size;
          const sy = (y * SIZE / size - AVATAR_PORTRAIT_BOUNDS.y) * SIZE / AVATAR_PORTRAIT_BOUNDS.size;
          const delta = pixelDelta(plain.data, original.data, offset);
          const tintDelta = pixelDelta(original.data, colored.data, offset);
          const margin = 2 * SIZE / size * SIZE / AVATAR_PORTRAIT_BOUNDS.size;
          if (sx < 145 - margin || sx > 382 + margin || sy < 160 - margin || sy > 270 + margin) {
            assert.ok(delta <= 1 && tintDelta <= 1, `${fixture.name}/${choice}/${size}: frame affected an unrelated region`);
          }
          assert.equal(original.data[offset + 3], colored.data[offset + 3], "frame color affected alpha");
          if (delta > 8) added++;
          if (tintDelta > 8) tinted++;
        }
        assert.ok(added > 0 && tinted > 0, "frame shape or color missing");
        if (size >= 104) for (const point of PROTECTED_POINTS[fixture.name].slice(0, 3)) {
          const x = Math.floor((AVATAR_PORTRAIT_BOUNDS.x + point.x / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
          const y = Math.floor((AVATAR_PORTRAIT_BOUNDS.y + point.y / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
          const offset = (y * size + x) * 4;
          assert.ok(pixelDelta(plain.data, original.data, offset) <= 1 && pixelDelta(plain.data, colored.data, offset) <= 1, "frame crossed a protected eye/mouth center");
        }
        const filename = `${fixture.name}-eyewear-${choice}-${size}.png`;
        await fs.writeFile(path.join(output, filename), colored.png);
        if (size === 256) {
          if (column === 0) eyewearSheet.push({ input: plain.png, left: 0, top: row * 256 });
          eyewearSheet.push({ input: original.png, left: (column * 2 + 1) * 256, top: row * 256 });
          eyewearSheet.push({ input: colored.png, left: (column * 2 + 2) * 256, top: row * 256 });
        }
        eyewearCases.push({ character: fixture.name, choice, size, file: filename, added, tinted, passed: true });
      }
    }
  }
  await sharp({ create: { width: 5 * 256, height: 2 * 256, channels: 3, background: "#F4F1F8" } }).composite(eyewearSheet).png().toFile(path.join(output, "eyewear-review.png"));
  const { AVATAR_HAIRSTYLES, selectAvatarHairstyle } = loadComponent(path.join(ROOT, "lib/profile/avatar-hairstyle.ts"));
  const hairstyleCases = [], hairstyleSheet = [];
  for (const [row, source] of AVATAR_HAIRSTYLES.entries()) {
    const avatar = selectAvatarHairstyle(normalizeAvatarConfig({ style: source.style, glasses: false, background: "sky" }), source.id);
    for (const size of sizes) {
      const original = await renderEyewear(avatar, size);
      const hair = await renderEyewear({ ...avatar, materialColors: { hair: "#80618F" } }, size);
      const skin = await renderEyewear({ ...avatar, materialColors: { skin: "#885139" } }, size);
      const combined = { ...avatar, materialColors: { hair: "#80618F", skin: "#A96A48" } };
      const color = await renderEyewear(combined, size);
      for (const [label, rendered] of [["hair", hair], ["skin", skin], ["combined", color]]) {
        let changed = 0;
        for (let i = 0; i < original.data.length; i += 4) {
          assert.ok(Math.abs(original.data[i+3] - rendered.data[i+3]) <= 1, source.id + ": alpha changed");
          if (pixelDelta(original.data, rendered.data, i) > 8) changed++;
        }
        assert.ok(changed > size*size*.015, source.id + "/" + size + "/" + label + ": material not visible");
      }
      const points = source.style === "masculine" ? [{ x: 211, y: 204 }, { x: 307, y: 202 }, { x: 257, y: 292 }] : [{ x: 213, y: 216 }, { x: 312, y: 210 }, { x: 263, y: 304 }];
      // At compact sizes the sampled pixels mix subpixel feature/skin edges.
      if (size >= 256) for (const point of points) {
        const x = Math.floor((AVATAR_PORTRAIT_BOUNDS.x + point.x / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
        const y = Math.floor((AVATAR_PORTRAIT_BOUNDS.y + point.y / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
        assert.ok(pixelDelta(original.data, color.data, (y * size + x)*4) <= 5, source.id + ": protected facial sample tinted");
      }
      if (size === 256) {
        for (const [column, result] of [original, hair, skin, color].entries()) {
          hairstyleSheet.push({ input: result.png, left: column * size, top: row * size });
        }
      }
      for (const [col, choice] of ["classic", "round", "square"].entries()) {
        const selected = selectAvatarLegacyEyewear(combined, choice);
        const frame = await renderEyewear(selected, size);
        const tinted = await renderEyewear({ ...selected, materialColors: { ...selected.materialColors, frame: "#B88E55" } }, size);
        let visible = 0, recolored = 0;
        for (let i=0; i<frame.data.length; i+=4) {
          if (pixelDelta(color.data, frame.data, i)>8) visible++;
          if (pixelDelta(frame.data, tinted.data, i)>8) recolored++;
          assert.ok(Math.abs(frame.data[i+3]-tinted.data[i+3])<=1);
        }
        assert.ok(visible>0 && recolored>0, source.id + "/" + size + "/" + choice + ": frame or tint missing");
        if (size >= 256) for (const point of points.slice(0,2)) {
          const x = Math.floor((AVATAR_PORTRAIT_BOUNDS.x + point.x / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
          const y = Math.floor((AVATAR_PORTRAIT_BOUNDS.y + point.y / SIZE * AVATAR_PORTRAIT_BOUNDS.size) / SIZE * size);
          assert.ok(pixelDelta(color.data, tinted.data, (y*size+x)*4)<=3, source.id + ": frame covers an eye center");
        }
        await fs.writeFile(path.join(output, source.id + "-" + choice + "-" + size + ".png"), tinted.png);
        if (size === 256) hairstyleSheet.push({ input: tinted.png, left: (4+col)*size, top: row*size });
        hairstyleCases.push({ hairstyle: source.id, size, frame: choice, visible, recolored, passed: true });
      }
    }
  }
  await sharp({ create: { width: 7*256, height: 4*256, channels: 3, background: "#F4F1F8" } }).composite(hairstyleSheet).png().toFile(path.join(output, "hairstyle-shared-renderer.png"));
  console.log("P4 shared hairstyle renderer: " + hairstyleCases.length + " frame/size cases passed");
  const { getAvatarOutfitOptions, selectAvatarFormalOutfit, setAvatarOutfitColor } = loadComponent(path.join(ROOT,"lib/profile/avatar-formal-outfit.ts"));
  const outfitFixtures = [
    ...fixtures.map(f => ({ style:f.style, id:f.name+"-original" })),
    ...AVATAR_HAIRSTYLES.map(f => ({ style:f.style, id:f.id, hairstyle:f.id })),
    ...fixtures.flatMap(f => [
      {style:f.style,id:f.name+"-classic-glasses", glasses:true, materialColors:f.materialColors},
      {style:f.style,id:f.name+"-dark", dark:true, materialColors:f.materialColors},
      {style:f.style,id:f.name+"-dark-glasses", dark:true, glasses:true, materialColors:f.materialColors},
    ]),
  ];
  const { selectClassicHairTone } = loadComponent(path.join(ROOT,"lib/profile/avatar-portrait.ts"));
  const outfitCases=[], outfitSheet=[], casualCases=[], casualSheet=[];
  for (const [row,fixture] of outfitFixtures.entries()) {
    let original=normalizeAvatarConfig({style:fixture.style,glasses:fixture.glasses??false,background:"sky",materialColors:fixture.materialColors});
    if(fixture.hairstyle) original=selectAvatarHairstyle(original,fixture.hairstyle);
    if(fixture.dark) original=selectClassicHairTone(original,"dark");
    for(const size of [48,256]) {
      const before=await renderEyewear(original,size);
      if(size===256&&row<6) {
        outfitSheet.push({input:before.png,left:0,top:row*size});
        casualSheet.push({input:before.png,left:0,top:row*size});
      }
      for(const [column,choice] of getAvatarOutfitOptions(fixture.style).entries()) {
        const selected=selectAvatarFormalOutfit(original,choice.id);
        const after=await renderEyewear(selected,size);
        const recolored=await renderEyewear(setAvatarOutfitColor(selected,"clothing","#886785"),size);
        let changed=0, tint=0;
        for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
          const i=(y*size+x)*4;
          const sy=(y*SIZE/size-AVATAR_PORTRAIT_BOUNDS.y)*SIZE/AVATAR_PORTRAIT_BOUNDS.size;
          // Above the neckline the original face must remain identical.
          if(sy<305) assert.ok(pixelDelta(before.data,after.data,i)<=1&&Math.abs(before.data[i+3]-after.data[i+3])<=1,fixture.id+"/"+choice.id+"/"+size+": face pixels changed at "+x+","+y);
          if(pixelDelta(before.data,after.data,i)>8) changed++;
          if(pixelDelta(after.data,recolored.data,i)>8) tint++;
          if(sy<360) assert.ok(pixelDelta(after.data,recolored.data,i)<=1,fixture.id+": clothing color entered the head");
          assert.ok(Math.abs(after.data[i+3]-recolored.data[i+3])<=1,fixture.id+": clothing color changed alpha");
        }
        assert.ok(changed>size*size*.01&&tint>size*size*.004,fixture.id+"/"+choice.id+": clothing not visible");
        // Prove each optional color channel is visible and changes no head pixels.
        for(const part of ["lining","tie"]) if(Object.hasOwn(choice.originals,part)) {
          const extra=await renderEyewear(setAvatarOutfitColor(selected,part,"#F4AF50"),size);
          let affected=0;
          for(let i=0;i<after.data.length;i+=4){
            if(pixelDelta(after.data,extra.data,i)>8) affected++;
            const y=Math.floor(i/4/size);
            const sy=(y*SIZE/size-AVATAR_PORTRAIT_BOUNDS.y)*SIZE/AVATAR_PORTRAIT_BOUNDS.size;
            if(sy<360) assert.ok(pixelDelta(after.data,extra.data,i)<=1);
          }
          assert.ok(affected>0,fixture.id+"/"+choice.id+"/"+part+": color channel not visible");
        }
        if(size===256) {
          if(row<6) {
            if(choice.id.startsWith("casual-")) casualSheet.push({input:after.png,left:(column-2)*size,top:row*size});
            else outfitSheet.push({input:after.png,left:(column+1)*size,top:row*size});
          }
          await fs.writeFile(path.join(output,fixture.id+"-"+choice.id+".png"),after.png);
        }
        (choice.id.startsWith("casual-") ? casualCases : outfitCases).push({fixture:fixture.id,outfit:choice.id,size,changed,tint,passed:true});
      }
    }
  }
  await sharp({create:{width:4*256,height:6*256,channels:3,background:"#F4F1F8"}}).composite(outfitSheet).png().toFile(path.join(output,"formal-outfit-review.png"));
  const outfitReview=await sharp(path.join(output,"formal-outfit-review.png")).resize({width:768}).jpeg({quality:83}).toBuffer();
  const outfitEncoded=outfitReview.toString("base64");
  for(let i=0;i<outfitEncoded.length;i+=2000) console.log("FORMAL_REVIEW "+String(i/2000).padStart(5,"0")+" "+outfitEncoded.slice(i,i+2000));
  console.log("FORMAL_OUTFIT_PROOF "+JSON.stringify({cases:outfitCases.length,faceProtected:true,source:"actual shared renderer"}));
  assert.equal(outfitCases.length,72,"P5 rendering coverage changed");
  assert.equal(casualCases.length,48,"P6 casual rendering coverage changed");
  await sharp({create:{width:3*256,height:6*256,channels:3,background:"#F4F1F8"}}).composite(casualSheet).png().toFile(path.join(output,"casual-outfit-review.png"));
  const casualEncoded=(await sharp(path.join(output,"casual-outfit-review.png")).resize({width:600}).jpeg({quality:83}).toBuffer()).toString("base64");
  for(let i=0;i<casualEncoded.length;i+=2000) console.log("CASUAL_REVIEW "+String(i/2000).padStart(5,"0")+" "+casualEncoded.slice(i,i+2000));
  console.log("CASUAL_OUTFIT_PROOF "+JSON.stringify({cases:casualCases.length,faceProtected:true,source:"actual shared renderer"}));
  return { rendererComponentSha256: sha256(await fs.readFile(path.join(ROOT, "components/profile/AvatarRenderer.tsx"))), embeddedLocalAssets: [...assets.keys()], cases: results, eyewearCases, hairstyleCases, outfitCases, casualCases };
}

async function main() {
  assert.ok(process.argv.length <= 3, "Usage: node --experimental-strip-types scripts/verify-avatar-material-rendering.mjs [output-directory]");
  const output = path.resolve(process.argv[2] ?? path.join(ROOT, ".avatar-material-rendering"));
  await fs.mkdir(output, { recursive: true });
  const canonicalOutput = await fs.realpath(output);
  const publicRoot = await fs.realpath(path.join(ROOT, "public"));
  const publicRelative = path.relative(publicRoot, canonicalOutput);
  assert.ok(publicRelative.startsWith(`..${path.sep}`) || path.isAbsolute(publicRelative), "QA output must stay outside public/");

  const componentPath = path.join(ROOT, "components/profile/AvatarMaterialFilter.tsx");
  const componentSource = await fs.readFile(componentPath, "utf8");
  const loadComponent = createComponentLoader();
  const { AvatarMaterialFilter } = loadComponent(componentPath);
  assert.equal(typeof AvatarMaterialFilter, "function");

  function svgFor(sourceUri, plan) {
    return Buffer.from(renderToStaticMarkup(React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg", width: SIZE, height: SIZE, viewBox: `0 0 ${SIZE} ${SIZE}`,
    },
    React.createElement("defs", null, plan ? React.createElement(AvatarMaterialFilter, { id: "material", plan, x: 0, y: 0, size: SIZE }) : null),
    React.createElement("image", { href: sourceUri, width: SIZE, height: SIZE, filter: plan ? "url(#material)" : undefined }))));
  }

  const report = {
    status: "running", renderer: "Sharp/librsvg using the actual React AvatarMaterialFilter",
    versions: { node: process.version, sharp: sharp.versions.sharp, librsvg: sharp.versions.rsvg, vips: sharp.versions.vips },
    componentSha256: sha256(componentSource),
    materialModuleSha256: sha256(await fs.readFile(path.join(ROOT, "lib/profile/avatar-materials.ts"))),
    featureModuleSha256: sha256(await fs.readFile(path.join(ROOT, "lib/profile/avatar-feature-paths.ts"))),
    maskAuthoringModuleSha256: sha256(await fs.readFile(path.join(ROOT, "scripts/build-avatar-material-masks.mjs"))),
    alphaTolerance: 1, opaqueOutsideRgbTolerance: 0, partialOutsidePremultipliedTolerance: 1,
    visualAcceptance: "NOT_APPROVED", browserAndIPhoneValidation: "NOT_PERFORMED",
    sources: [], cases: [],
  };
  const rows = [];
  try {
    for (const [src, expectedHash] of Object.entries(SOURCE_HASHES)) {
      const sourceBytes = await fs.readFile(path.join(ROOT, "public", src));
      assert.equal(sha256(sourceBytes), expectedHash, `${src}: source artwork changed; re-review its registered coverage`);
      const registered = getAvatarMaterialSource(src);
      assert.ok(registered, `${src}: known source is no longer registered`);
      const character = registered.style === "masculine" ? "male" : "female";
      const name = path.basename(src, ".webp");
      const sourcePng = await sharp(sourceBytes).png().toBuffer();
      const sourceUri = dataUri(sourcePng);
      const baselinePng = await sharp(svgFor(sourceUri, null)).png().toBuffer();
      const baseline = await rgba(baselinePng);
      const sourceRaw = await rgba(sourcePng);
      const emptyCoverage = Buffer.alloc(SIZE * SIZE * 4);
      const baselineStats = rasterStats(sourceRaw, baseline, emptyCoverage, []);
      assert.ok(baselineStats.maxAlphaDelta <= 1 && baselineStats.opaqueOutsideChanged === 0, `${src}: unfiltered raster baseline changed the source`);
      await fs.writeFile(path.join(output, `${name}-original.png`), baselinePng);

      const examplePlan = getAvatarMaterialPlan(src, { hair: "#A06EE8" });
      assert.ok(examplePlan);
      assert.match(examplePlan.coverageUri, /^\/avatar\/materials\/v1\/(?:male|female)(?:-glasses)?\.png$/);
      const coverageBytes = await fs.readFile(path.join(ROOT, "public", examplePlan.coverageUri));
      const coverage = await rgba(coverageBytes);
      const maskName = path.basename(examplePlan.coverageUri, ".png");
      const { png: authoredPng } = await createAvatarMaterialMask(maskName);
      const authored = await rgba(authoredPng);
      assert.deepEqual(coverage, authored, `${src}: committed coverage PNG differs from source-registered authored geometry/refinement`);
      for (let offset = 0; offset < coverage.length; offset += 4) {
        assert.equal(coverage[offset + 3], 255, `${src}: coverage atlas must have an opaque background`);
        assert.ok(coverage[offset] + coverage[offset + 1] + coverage[offset + 2] <= 256, `${src}: overlapping material ownership exceeds one pixel`);
      }
      report.sources.push({ src, sha256: expectedHash, coverage: examplePlan.coverageUri, coverageSha256: sha256(coverageBytes), baselineStats });

      for (const testCase of CASES) {
        const plan = getAvatarMaterialPlan(src, testCase.colors);
        const parts = plan?.channels.map((channel) => channel.part) ?? [];
        const expectedParts = Object.keys(testCase.colors).filter((part) => part !== "frame" || registered.glasses);
        assert.deepEqual(parts, expectedParts, `${src}/${testCase.name}: unsupported or missing material channel`);
        const embeddedPlan = plan ? { ...plan, coverageUri: dataUri(coverageBytes) } : null;
        const rendered = await sharp(svgFor(sourceUri, embeddedPlan)).png().toBuffer();
        const pixels = await rgba(rendered);
        await fs.writeFile(path.join(output, `${name}-${testCase.name}.png`), rendered);
        const stats = rasterStats(baseline, pixels, coverage, parts);
        const failures = [];
        if (stats.maxAlphaDelta > 1) failures.push(`Source alpha changed by ${stats.maxAlphaDelta}, tolerance 1`);
        if (stats.opaqueOutsideChanged > 0) failures.push(`${stats.opaqueOutsideChanged} opaque pixels changed outside selected coverage`);
        if (stats.maxOutsidePremultipliedDelta > 1) failures.push(`Outside premultiplied RGB changed by ${stats.maxOutsidePremultipliedDelta}, tolerance 1`);
        for (const part of parts) {
          if (stats.targetChangedPixels[part] < 100) failures.push(`${part}: fewer than 100 visible target pixels changed`);
        }
        if (!parts.length && !baseline.equals(pixels)) failures.push("An unsupported frame-only color changed a portrait without glasses");
        let protectedPixelsChecked = checkProtectedPatches(baseline, pixels, coverage, parts, PROTECTED_POINTS[character], "protected", failures);
        if (parts.length === 1 && parts[0] === "frame") {
          protectedPixelsChecked += checkProtectedPatches(baseline, pixels, coverage, ["frame"], AVATAR_FRAME_PATHS[character].protectedLensPoints, "clear-lens", failures);
        }
        const featureSamples = testCase.name === "skin-deep"
          ? checkFeatureSamples(baseline, pixels, coverage, AVATAR_FEATURE_PATHS[maskName], failures)
          : undefined;
        report.cases.push({ source: src, name: testCase.name, colors: testCase.colors, activeChannels: parts, stats, protectedPixelsChecked, ...(featureSamples ? { featureSamples } : {}), passed: failures.length === 0, failures });
      }
      rows.push(name);
    }
    await writeContactSheet(output, rows);
    const failedCases = report.cases.filter((item) => !item.passed);
    assert.equal(failedCases.length, 0, `${failedCases.length} rendered cases failed; inspect report.json (${failedCases[0]?.source}/${failedCases[0]?.name}: ${failedCases[0]?.failures[0]})`);
    report.sharedRenderer = await verifySharedRenderer(output, loadComponent);
    // Candidate-only assets are deliberately outside public/ and not registered in
    // the runtime. Exercise the existing filter without weakening legacy gates.
    const candidateRoot = path.join(ROOT, "docs/avatar-face-masters");
    const manifest = JSON.parse(await fs.readFile(path.join(candidateRoot, "materials/manifest.json"), "utf8"));
    assert.equal(manifest.status, "candidate-only");
    const candidateCases = [
      { name: "hair-black", colors: { hair: "#000000" } },
      { name: "hair-white", colors: { hair: "#FFFFFF" } },
      { name: "hair-violet", colors: { hair: "#9669C8" } },
      { name: "skin-light", colors: { skin: "#F5D7BD" } },
      { name: "skin-deep", colors: { skin: "#986448" } },
      { name: "combined", colors: { hair: "#30343C", skin: "#E2B18A" } },
    ];
    report.independentCandidates = { visualAcceptance: "NOT_APPROVED", sources: [], cases: [] };
    const candidateTiles = { initial: [], refined: [] };
    const tile = 192, rowHeight = 218;
    for (const [row, [id, spec]] of Object.entries(manifest.sources).entries()) {
      assert.ok(["male-b", "female-b"].includes(id));
      const art = await fs.readFile(path.join(candidateRoot, id + ".webp"));
      const initialMask = await fs.readFile(path.join(candidateRoot, "materials", id + ".png"));
      assert.equal(sha256(art), spec.sourceSha256);
      assert.equal(sha256(initialMask), spec.maskSha256);
      const refinement = await refineCandidateMaterial(id, art, initialMask);
      await fs.writeFile(path.join(output, id + "-refined-mask.png"), refinement.png);
      const sourceUri = dataUri(await sharp(art).png().toBuffer());
      const baselinePng = await sharp(svgFor(sourceUri, null)).png().toBuffer();
      const baseline = await rgba(baselinePng);
      for (const [variant, mask] of [["initial", initialMask], ["refined", refinement.png]]) {
        const coverage = await rgba(mask);
        const coverageCount = [0,0];
        for (let i = 0; i < coverage.length; i += 4) {
          assert.equal(coverage[i + 3], 255, id + ": mask must be opaque");
          assert.equal(coverage[i + 2], 0, id + ": no eyewear channel");
          assert.ok(coverage[i] + coverage[i + 1] <= 256, id + ": overlapping ownership");
          for (let c = 0; c < 2; c++) if (coverage[i+c] > 128 && baseline[i+3] > 200) coverageCount[c]++;
        }
        for (let c = 0; c < 2; c++) {
          const [x,y] = c === 0 ? spec.hairPoint : spec.skinPoint;
          const i = imageIndex(x,y);
          assert.ok(baseline[i+3] > 200 && coverage[i+c] > 200 && coverageCount[c] > 10000, id + ": channel missing");
        }
        report.independentCandidates.sources.push({ id, variant, sourceSha256: spec.sourceSha256, maskSha256: sha256(mask), coverageCount, ...(variant === "refined" ? {restoredEye:refinement.restoredEye,restoredLip:refinement.restoredLip} : {}) });
        const addTile = async (png, col, label) => {
          const thumbnail = await sharp(png).resize(tile, tile).flatten({background:"#E9E1F3"}).png().toBuffer();
          candidateTiles[variant].push({input:thumbnail,left:col*tile,top:row*rowHeight+26});
          candidateTiles[variant].push({input:Buffer.from(`<svg width="${tile}" height="26"><text x="6" y="17" font-size="11" font-family="sans-serif" fill="#484151">${id} / ${label}</text></svg>`),left:col*tile,top:row*rowHeight});
        };
        await addTile(baselinePng, 0, "original");
        for (const [col, item] of candidateCases.entries()) {
          const parts = Object.keys(item.colors);
          const plan = {
            coverageUri: dataUri(mask), frameGuard: false,
            channels: parts.map(part => ({part, tables:avatarMaterialTransfer(spec.originals[part], item.colors[part], part)})),
          };
          const png = await sharp(svgFor(sourceUri, plan)).png().toBuffer();
          const pixels = await rgba(png);
          const stats = rasterStats(baseline, pixels, coverage, parts);
          const failures = [];
          if (stats.maxAlphaDelta > 1) failures.push("alpha changed");
          if (stats.opaqueOutsideChanged !== 0) failures.push("opaque RGB outside mask changed");
          if (stats.maxOutsidePremultipliedDelta > 1) failures.push("premultiplied RGB outside mask changed");
          for (const part of parts) if (stats.targetChangedPixels[part] < 100) failures.push(part + ": insufficient target change");
          const protectedPixelsChecked = checkProtectedPatches(baseline, pixels, coverage, parts, spec.protected.map(([x,y])=>({x,y})), id, failures);
          report.independentCandidates.cases.push({id, variant, name:item.name, stats, protectedPixelsChecked, passed:failures.length===0, failures});
          await addTile(png, col+1, item.name);
        }
      }
    }
    for (const variant of ["initial","refined"]) {
      await sharp({create:{width:tile*(candidateCases.length+1),height:rowHeight*2,channels:3,background:"#F4F1F8"}})
        .composite(candidateTiles[variant]).png().toFile(path.join(output,variant === "initial" ? "independent-material-review.png" : "independent-material-refined-review.png"));
    }
    assert.equal(report.independentCandidates.cases.length,24);
    const failedCandidate = report.independentCandidates.cases.find(item=>!item.passed);
    assert.ok(!failedCandidate, failedCandidate && failedCandidate.id + "/" + failedCandidate.variant + "/" + failedCandidate.name + ": " + failedCandidate.failures[0]);
    console.log("INDEPENDENT_MATERIAL_PROOF " + JSON.stringify({cases:24,source:"actual AvatarMaterialFilter, initial and refined candidates only",visualAcceptance:"NOT_APPROVED"}));
    report.independentHairstyles = await verifyIndependentHairstyles(ROOT, output);
    // Variant masks are candidate assets, not registered runtime sources.
    const variantManifest = JSON.parse(await fs.readFile(path.join(candidateRoot,"hairstyle-materials","manifest.json"),"utf8"));
    const hairstyleManifest = JSON.parse(await fs.readFile(path.join(candidateRoot,"hairstyles","manifest.json"),"utf8"));
    assert.equal(variantManifest.status,"candidate-only");
    assert.deepEqual(Object.keys(variantManifest.variants).sort(),Object.keys(hairstyleManifest.variants).sort());
    report.independentHairstyleMaterials = {sources:[],cases:[],visualAcceptance:"NOT_APPROVED",runtimeRegistration:false};
    const hairstyleMaterialTiles = [];
    for (const [row,[id,item]] of Object.entries(variantManifest.variants).entries()) {
      const spec = manifest.sources[item.base];
      assert.ok(spec && hairstyleManifest.variants[id].base === item.base);
      const art = await fs.readFile(path.join(candidateRoot,"hairstyles",id+".webp"));
      const mask = await fs.readFile(path.join(candidateRoot,"hairstyle-materials",id+".png"));
      assert.equal(sha256(art),item.sourceSha256);
      assert.equal(item.sourceSha256,hairstyleManifest.variants[id].sha256);
      assert.equal(sha256(mask),item.maskSha256);
      assert.equal(mask.length,item.bytes);
      assert.ok(mask.length <= 24*1024);
      const masterArt = await fs.readFile(path.join(candidateRoot,item.base+".webp"));
      const initialMask = await fs.readFile(path.join(candidateRoot,"materials",item.base+".png"));
      const lock = await fs.readFile(path.join(candidateRoot,"hairstyles",item.base+"-locked.png"));
      assert.equal(sha256(masterArt),spec.sourceSha256);
      assert.equal(sha256(initialMask),spec.maskSha256);
      assert.equal(sha256(lock),hairstyleManifest.sources[item.base].lockSha256);
      const refined = await refineCandidateMaterial(item.base,masterArt,initialMask);
      const generated = await makeVariantMask(id,art,refined.png,lock);
      const coverage = await rgba(mask);
      assert.deepEqual(await rgba(generated.png),coverage,id+": committed ownership differs from generated mask");
      assert.equal(generated.locked,hairstyleManifest.sources[item.base].protectedPixels);
      const sourceUri = dataUri(await sharp(art).png().toBuffer());
      const baselinePng = await sharp(svgFor(sourceUri,null)).png().toBuffer();
      const baseline = await rgba(baselinePng);
      const rawSource = await rgba(art);
      const coverageCount=[0,0];
      for(let i=0;i<coverage.length;i+=4) {
        assert.equal(coverage[i+3],255,id+": coverage must be opaque");
        assert.equal(coverage[i+2],0,id+": no eyewear channel");
        assert.ok(coverage[i]+coverage[i+1]<=255,id+": overlapping ownership");
        if(rawSource[i+3]===0) assert.equal(coverage[i]+coverage[i+1],0,id+": ownership outside portrait");
        for(let c=0;c<2;c++) if(coverage[i+c]>128 && baseline[i+3]>200) coverageCount[c]++;
      }
      for(let c=0;c<2;c++) {
        const [x,y]=c===0?spec.hairPoint:spec.skinPoint;
        const i=imageIndex(x,y);
        assert.ok(baseline[i+3]>200 && coverage[i+c]>200 && coverageCount[c]>10000,id+": missing visible channel");
      }
      report.independentHairstyleMaterials.sources.push({id,maskSha256:item.maskSha256,lockedOwnershipPixels:generated.locked,coverageCount});
      const addTile=async(png,col,label)=>{
        const thumb=await sharp(png).resize(tile,tile).flatten({background:"#E9E1F3"}).png().toBuffer();
        hairstyleMaterialTiles.push({input:thumb,left:col*tile,top:row*rowHeight+26});
        hairstyleMaterialTiles.push({input:Buffer.from(`<svg width="${tile}" height="26"><text x="6" y="17" font-size="11" font-family="sans-serif" fill="#484151">${id} / ${label}</text></svg>`),left:col*tile,top:row*rowHeight});
      };
      await addTile(baselinePng,0,"original");
      for(const [col,entry] of candidateCases.entries()) {
        const parts=Object.keys(entry.colors);
        const plan={coverageUri:dataUri(mask),frameGuard:false,channels:parts.map(part=>({part,tables:avatarMaterialTransfer(spec.originals[part],entry.colors[part],part)}))};
        const png=await sharp(svgFor(sourceUri,plan)).png().toBuffer();
        const pixels=await rgba(png);
        const stats=rasterStats(baseline,pixels,coverage,parts);
        const failures=[];
        if(stats.maxAlphaDelta>1)failures.push("alpha changed");
        if(stats.opaqueOutsideChanged!==0)failures.push("opaque RGB outside mask changed");
        if(stats.maxOutsidePremultipliedDelta>1)failures.push("premultiplied RGB outside mask changed");
        for(const part of parts)if(stats.targetChangedPixels[part]<100)failures.push(part+": insufficient target change");
        const protectedPixelsChecked=checkProtectedPatches(baseline,pixels,coverage,parts,spec.protected.map(([x,y])=>({x,y})),id,failures);
        report.independentHairstyleMaterials.cases.push({id,name:entry.name,stats,protectedPixelsChecked,passed:failures.length===0,failures});
        await addTile(png,col+1,entry.name);
      }
    }
    await sharp({create:{width:tile*(candidateCases.length+1),height:rowHeight*4,channels:3,background:"#F4F1F8"}})
      .composite(hairstyleMaterialTiles).png().toFile(path.join(output,"independent-hairstyle-material-review.png"));
    assert.equal(report.independentHairstyleMaterials.cases.length,24);
    const failedHairstyleMaterial=report.independentHairstyleMaterials.cases.find(item=>!item.passed);
    assert.ok(!failedHairstyleMaterial,failedHairstyleMaterial && failedHairstyleMaterial.id+"/"+failedHairstyleMaterial.name+": "+failedHairstyleMaterial.failures[0]);
    console.log("INDEPENDENT_HAIRSTYLE_MATERIAL_PROOF "+JSON.stringify({cases:24,lockedOwnershipPixels:report.independentHairstyleMaterials.sources.reduce((n,item)=>n+item.lockedOwnershipPixels,0),visualAcceptance:"NOT_APPROVED"}));
    report.independentEyewear = await verifyIndependentEyewear(ROOT, output, loadComponent, svgFor);
    report.independentOutfits = await verifyIndependentOutfits(ROOT, output, loadComponent, svgFor);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Material raster proof passed: ${report.sources.length} pinned sources, ${report.cases.length} material cases, ${report.sharedRenderer.cases.length} shared-renderer cases. Output: ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
