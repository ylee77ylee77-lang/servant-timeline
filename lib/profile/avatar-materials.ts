import type { AvatarConfig, AvatarMaterialColors } from "./avatar.ts";
import type { AvatarColorHex, AvatarColorPart } from "./avatar-color-wheel.ts";
import { AVATAR_PORTRAITS, AVATAR_CLASSIC_DARK_PORTRAITS, getAvatarPortraitPlan, getClassicHairTone } from "./avatar-portrait.ts";
import { AVATAR_FRAME_PATHS } from "./avatar-frame-paths.ts";
import { AVATAR_FEATURE_PATHS } from "./avatar-feature-paths.ts";

type Character = "masculine" | "feminine";
type MaterialChannel = Readonly<{ part: AvatarColorPart; original: AvatarColorHex }>;

/**
 * Source-registered 2D color coverage, in the ORIGINAL 512px artboard.
 * These are not recovered 3D materials or interchangeable hairstyle layers.
 * Only the exact v2 sources and their aligned v2-tone derivatives are supported.
 * Outer hair paths may extend into transparency: the filter preserves SourceAlpha.
 */
const HAIR: Record<Character, string> = {
  masculine: "M0 0H512V193L389 202L378 222L363 245L360 210C359 189 352 165 341 147C334 127 324 111 308 104C291 98 266 98 248 107C246 117 251 132 252 143C255 153 249 162 239 166C228 169 215 167 199 165C181 163 171 169 162 182C155 194 157 221 151 248L142 230L132 205L112 199L0 185Z",
  feminine: "M0 0H512V448L451 447C426 440 404 433 385 426C367 421 354 413 342 416C328 400 319 382 318 356L333 331L355 305L372 280C386 277 397 265 401 250C405 234 402 216 389 211L374 205C368 191 350 171 335 151C327 129 314 109 300 103C284 96 262 98 244 104L234 110C229 129 224 148 216 164C200 185 181 207 166 223L158 234C154 245 158 257 159 273C157 283 164 296 174 303C185 323 204 344 218 355C221 376 218 400 211 420C216 442 213 462 202 477C195 492 193 504 197 512H0Z",
};

const SKIN: Record<Character, string> = {
  masculine: "M96 80H416V280L356 282C347 301 338 315 328 326L330 367L342 396C317 418 294 432 267 433C240 433 209 413 183 396L193 371L195 327C178 311 166 296 158 281L105 285Z",
  feminine: "M100 80H425V276L368 278C359 309 341 333 319 349L319 381C320 398 330 410 345 418C332 432 311 437 282 439C255 441 229 435 209 426C217 406 223 382 218 354C200 341 184 326 175 307L123 313Z",
};

const ORIGINAL: Record<Character, Record<AvatarColorPart, AvatarColorHex>> = {
  masculine: { hair: "#674637", skin: "#EDB18D", frame: "#3B3935" },
  feminine: { hair: "#784E3B", skin: "#F2BC9C", frame: "#3A3732" },
};

export const AVATAR_MATERIAL_PARTS = ["hair", "skin", "frame"] as const;

function coverageSvg(style: Character, glasses: boolean) {
  const name = style === "masculine" ? "male" : "female";
  const frame = AVATAR_FRAME_PATHS[name];
  const featureKey = glasses ? `${name}-glasses` as const : name;
  const features = AVATAR_FEATURE_PATHS[featureKey];
  const protectedPaths = [...features.eyes, ...features.mouth, ...features.brows, ...features.lashes].map((d) => `<path d="${d}" fill="black"/>`).join("");
  // RGB encodes ownership. Later shapes occlude earlier shapes, just as in art.
  // Opaque black background avoids unpremultiplication at fractional mask edges.
  const frameMarkup = frame.rings.map((ring) => `<path d="${ring.outer} ${ring.lens}" fill="#0000ff" fill-rule="evenodd"/>`).join("")
    + [frame.bridge, ...frame.temples].map((path) => `<path d="${path}" fill="#0000ff"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="black"/><path d="${SKIN[style]}" fill="#00ff00"/><path d="${HAIR[style]}" fill="#ff0000"/>${protectedPaths}${glasses ? frameMarkup : ""}</svg>`;
}

// Built once, contains only trusted constant paths; never interpolates profile data.
const COVERAGE = {
  masculine: { plain: coverageSvg("masculine", false), glasses: coverageSvg("masculine", true) },
  feminine: { plain: coverageSvg("feminine", false), glasses: coverageSvg("feminine", true) },
};

export function getAvatarMaterialSource(src: string) {
  for (const style of ["masculine", "feminine"] as const) {
    for (const variant of ["plain", "glasses"] as const) {
      const dark = src === AVATAR_CLASSIC_DARK_PORTRAITS[style][variant];
      if (src !== AVATAR_PORTRAITS[style][variant] && !dark) continue;
      const originals = { ...ORIGINAL[style], ...(dark ? { hair: "#46403D" as AvatarColorHex } : {}) };
      return { style, glasses: variant === "glasses", originals, coverage: COVERAGE[style][variant], hairBoundary: HAIR[style] };
    }
  }
  return null;
}

export function getAvatarMaterialChannels(avatar: AvatarConfig): MaterialChannel[] {
  // Ask the same resolver used by the renderer; unknown future art is not colorable.
  const { portrait } = getAvatarPortraitPlan({ ...avatar, displayMode: "custom" });
  const source = portrait && getAvatarMaterialSource(portrait);
  if (!source) return [];
  return AVATAR_MATERIAL_PARTS.filter((part) => part !== "frame" || avatar.glasses).map((part) => ({
    part,
    // A reset restores the selected legacy original, including saved black hair.
    original: part === "hair" && getClassicHairTone(avatar) === "dark" ? "#46403D" : source.originals[part],
  }));
}

export function setAvatarMaterialColor(avatar: AvatarConfig, part: AvatarColorPart, color: AvatarColorHex | null): AvatarConfig {
  const materialColors = { ...avatar.materialColors };
  if (color === null) delete materialColors[part];
  else materialColors[part] = color;
  const next = { ...avatar };
  if (Object.keys(materialColors).length) next.materialColors = materialColors;
  else delete next.materialColors;
  return next;
}

/**
 * Channel curves pass through black, the source midtone and a soft white
 * highlight. They retain raster shading/texture; they do not simulate relighting.
 * A true black/white selection keeps a small shading range so strands remain legible.
 */
export function avatarMaterialTransfer(original: AvatarColorHex, color: AvatarColorHex, part: AvatarColorPart = "hair"): [string, string, string] {
  if (![original, color].every((value) => value.length === 7 && /^#[0-9a-f]{6}$/i.test(value))) {
    throw new Error("Invalid avatar material color");
  }
  const rgb = [1, 3, 5].map((offset) => parseInt(original.slice(offset, offset + 2), 16) / 255);
  const source = Math.max(1 / 255, Math.min(254 / 255, rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722));
  return [1, 3, 5].map((offset, channel) => {
    const target = parseInt(color.slice(offset, offset + 2), 16) / 255;
    // Preserve readable texture at both extremes. The picker remains exact RGB;
    // as with a real material, rendered pixels vary with baked light and shadow.
    const mid = 0.025 + 0.92 * target;
    return Array.from({ length: 33 }, (_, index) => {
      const value = index / 32;
      // Skin retains the original warm/chroma variation (including blush).
      // Converting it to grey first makes light tones look like stone.
      const mapped = part === "skin" ? value * target / Math.max(1 / 255, rgb[channel]) : value <= source
        ? mid * value / source
        : mid + (1 - mid) * Math.pow((value - source) / (1 - source), 1.65);
      return Math.min(1, Math.max(0, mapped)).toFixed(6);
    }).join(" ");
  }) as [string, string, string];
}

export function getAvatarMaterialPlan(src: string, colors?: AvatarMaterialColors) {
  const source = getAvatarMaterialSource(src);
  if (!source || !colors) return null;
  const channels = AVATAR_MATERIAL_PARTS.flatMap((part) => {
    const color = colors[part];
    if (!color || (part === "frame" && !source.glasses)) return [];
    return [{ part, tables: avatarMaterialTransfer(source.originals[part], color, part) }];
  });
  return channels.length ? {
    coverageUri: `/avatar/materials/v1/${source.style === "masculine" ? "male" : "female"}${source.glasses ? "-glasses" : ""}.png`,
    channels,
  } : null;
}
