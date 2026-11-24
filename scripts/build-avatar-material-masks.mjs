/** Reproduce source-registered coverage PNGs from the code-native SVG paths.
 * Usage: node --experimental-strip-types scripts/build-avatar-material-masks.mjs [--check]
 * These are RGB ownership maps, not edited portraits. No source raster is written.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { getAvatarMaterialSource } from "../lib/profile/avatar-materials.ts";
import { AVATAR_FEATURE_PATHS } from "../lib/profile/avatar-feature-paths.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "public/avatar/materials/v1");
const check = process.argv.includes("--check");
const sources = {
  "v2/male.webp": "7f9899e7024c6090692585ba2fd26fd1430c2760b4d6b531d20ac5e1c7f36e59",
  "v2/male-glasses.webp": "ff9d0e8c53fc5f1168d9e9cc40ebb0f040dc2154225a06a5c99e1364a9ba3cc5",
  "v2/female.webp": "e95c91cfd17ebc4965c8acfc74d8d4d19d787a5b91a99c46c425221f17b126a2",
  "v2/female-glasses.webp": "a14b3ce493f0d161cd6257d8f334531bc921bc341cf45a46481695ffee80bfb0",
  "v2-tones/male-dark.webp": "9a6089d396f8223cdf2a53dfa0b2e7ce8b820892c1fdc2d377fc43bf6da6f07c",
  "v2-tones/male-dark-glasses.webp": "1a1d90c455e0af0dbf8466fe506ba04880435888481351e62c0c347d98db4a1a",
  "v2-tones/female-dark.webp": "1cfe3de969b0cefb6273d855b0042975dba9d6f9488c28414139b79def9cb4b7",
  "v2-tones/female-dark-glasses.webp": "bc058ce99e0c0627cfc18f5fb77687672ed9e9b1e13fd5699aa779fe212c659a",
};

export async function createAvatarMaterialMask(name) {
  const source = getAvatarMaterialSource(`/avatar/scenes/v2/${name}.webp`);
  if (!source) throw new Error(`Unregistered source: ${name}`);
  const pixels = await sharp(Buffer.from(source.coverage)).removeAlpha().raw().toBuffer();
  const feature = AVATAR_FEATURE_PATHS[name];
  const svg = (markup) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/>${markup}</svg>`);
  const envelope = await sharp(svg([...feature.brows, ...feature.lashes].map((d) => `<path d="${d}" fill="white"/>`).join("")))
    .removeAlpha().raw().toBuffer();
  const boundary = await sharp(svg(`<path d="${source.hairBoundary}" fill="none" stroke="white" stroke-width="7"/>`))
    .removeAlpha().raw().toBuffer();
  const raster = await sharp(path.join(root, "public", feature.source)).removeAlpha().raw().toBuffer();
  const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pixels.length; i += 3) {
    const r = raster[i], g = raster[i + 1], b = raster[i + 2];
    // Preserve dark brow/lash hairs, but let bright skin between them tint.
    // Eye whites, teeth and lips never use this source-luminance refinement.
    const skinInEnvelope = envelope[i] * smooth(78, 154, r * .2126 + g * .7152 + b * .0722);
    pixels[i] = Math.min(pixels[i], 255 - pixels[i + 2]);
    pixels[i + 1] = Math.min(255 - pixels[i] - pixels[i + 2], pixels[i + 1] + Math.round(skinInEnvelope));
    // Only a narrow traced hairline band may reassign a light warm edge to skin.
    // This removes the untouched original-skin rim without global segmentation.
    const skinAtHairline = boundary[i] / 255 * smooth(145, 210, r) * smooth(25, 55, r - g);
    const transfer = Math.min(pixels[i], Math.round(pixels[i] * skinAtHairline));
    pixels[i] -= transfer;
    pixels[i + 1] += transfer;
  }
  const png = await sharp(pixels, { raw: { width: 512, height: 512, channels: 3 } })
    .png({ compressionLevel: 9 }).toBuffer();
  return { pixels, png };
}

export async function buildAvatarMaterialMasks() {
  for (const [name, expected] of Object.entries(sources)) {
    const bytes = await fs.readFile(path.join(root, "public/avatar/scenes", name));
    if (createHash("sha256").update(bytes).digest("hex") !== expected) {
      throw new Error(`${name}: source changed; review its material coverage before release`);
    }
  }
  
  if (!check) await fs.mkdir(target, { recursive: true });
  for (const name of ["male", "male-glasses", "female", "female-glasses"]) {
    const { pixels, png } = await createAvatarMaterialMask(name);
    const destination = path.join(target, `${name}.png`);
    if (png.length > 24 * 1024) throw new Error(`${name}: coverage exceeds mobile budget`);
    if (check) {
      const existing = await sharp(destination).removeAlpha().raw().toBuffer();
      if (!existing.equals(pixels)) throw new Error(`${name}: regenerate the stale coverage PNG`);
    } else {
      await fs.writeFile(destination, png);
    }
    console.log(`${name}: ${check ? "verified" : "generated"}, ${png.length} bytes`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildAvatarMaterialMasks();
}
